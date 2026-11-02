// Merge school items, members and notes into the live D1 state.
// Usage: node scripts/import-school.mjs path/to/import.json
//
// import.json shape:
// {
//   "members": ["Solvei", "Ellinor"],
//   "school":  [{"child":"Solvei","date":"2026-11-03","type":"homework","title":"...","subject":"Norsk"}],
//   "notes":   ["..."]
// }
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-school.mjs import.json");
  process.exit(1);
}

const COLORS = ["#d9622b", "#2f7fbf", "#3f8f5a", "#b0489a", "#c79a1c", "#6b5bd2", "#1f9aa3", "#c0392b"];
const STAPLES = ["salt", "pepper", "oil", "butter", "onion", "garlic", "flour", "sugar", "rice", "pasta", "eggs", "milk"];

const wrangler =
  [
    join(root, "node_modules", ".bin", "wrangler"),
    join(process.env.HOME || "", ".local", "bin", "wrangler"),
  ].find((p) => p && existsSync(p)) || "wrangler";

function run(args) {
  const res = spawnSync(wrangler, args, { cwd: root, encoding: "utf8" });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || "wrangler failed").trim());
  return res.stdout;
}
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);
const esc = (s) => String(s).replace(/'/g, "''");

const input = JSON.parse(readFileSync(inputPath, "utf8"));
const raw = JSON.parse(
  run(["d1", "execute", "familyhub", "--remote", "--json", "--command", "SELECT state FROM kv WHERE id='family';"])
);
const row = raw[0]?.results?.[0];
const state = row?.state
  ? JSON.parse(row.state)
  : {
      members: [], events: [], meals: {}, shopping: [], chores: [], notes: [], contacts: [],
      recipes: [], staples: [...STAPLES], school: [], rejected: [],
    };

const findMember = (name) => {
  const n = String(name || "").trim().toLowerCase();
  return state.members.find((m) => String(m.name).trim().toLowerCase() === n);
};

for (const m of input.members || []) {
  if (!findMember(m)) state.members.push({ id: uid(), name: String(m).trim(), color: COLORS[state.members.length % COLORS.length] });
}

let addedSchool = 0;
for (const item of input.school || []) {
  const member = findMember(item.child);
  if (!member) throw new Error(`Unknown child "${item.child}" — add them under members first`);
  const title = String(item.title).trim();
  const duplicate = state.school.some(
    (s) => s.who === member.id && s.date === item.date && String(s.title).toLowerCase() === title.toLowerCase()
  );
  if (duplicate) continue;
  state.school.push({
    id: uid(),
    who: member.id,
    date: item.date,
    type: ["homework", "activity", "event"].includes(item.type) ? item.type : "homework",
    title,
    subject: String(item.subject || "").slice(0, 60),
    done: false,
  });
  addedSchool++;
}

let addedNotes = 0;
for (const text of input.notes || []) {
  const t = String(text).trim();
  if (!t || state.notes.some((n) => n.text === t)) continue;
  state.notes.push({ id: uid(), text: t });
  addedNotes++;
}

const sqlPath = join(tmpdir(), "familyhub-school-import.sql");
const now = new Date().toISOString();
writeFileSync(
  sqlPath,
  `INSERT INTO kv (id, state, updated_at) VALUES ('family', '${esc(JSON.stringify(state))}', '${now}') ` +
    `ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at;\n`
);
run(["d1", "execute", "familyhub", "--remote", "--yes", "--file", sqlPath]);

console.log(`✓ ${state.members.length} member(s), ${addedSchool} new school item(s), ${addedNotes} new note(s).`);
const skipped = (input.school || []).length - addedSchool;
if (skipped > 0) console.log(`  ${skipped} duplicate school item(s) skipped.`);
