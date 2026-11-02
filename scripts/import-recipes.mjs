// Merge frequent recipes into the live D1 state.
// Usage: node scripts/import-recipes.mjs imports/recipes.json
//
// import.json shape:
// {
//   "staples": ["salt", "pepper", "pasta", "rice"],
//   "recipes": [
//     {"name":"Tacos","effort":1,"minutes":25,"rating":4,"ingredients":["..."]},
//     {"name":"Laks med poteter","effort":1,"minutes":30,"rating":5,"ingredients":["..."]}
//   ]
// }
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-recipes.mjs imports/recipes.json");
  process.exit(1);
}

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
const minutesOf = (r) => {
  const m = +((r && r.minutes) || 0);
  if (m >= 5) return m;
  const e = (r && r.effort) || 1;
  return e === 1 ? 30 : e === 3 ? 60 : 45;
};

const input = JSON.parse(readFileSync(inputPath, "utf8"));
const raw = JSON.parse(
  run(["d1", "execute", "familyhub", "--remote", "--json", "--command", "SELECT state FROM kv WHERE id='family';"])
);
const row = raw[0]?.results?.[0];
const state = row?.state
  ? JSON.parse(row.state)
  : { members: [], events: [], meals: {}, shopping: [], chores: [], notes: [], contacts: [], recipes: [], staples: [...STAPLES], school: [], rejected: [], docs: [] };
if (!Array.isArray(state.recipes)) state.recipes = [];
if (!Array.isArray(state.staples)) state.staples = [...STAPLES];

let added = 0;
let updated = 0;
for (const r of input.recipes || []) {
  const name = String(r.name || "").trim();
  if (!name) continue;
  const effort = [1, 2, 3].includes(+r.effort) ? +r.effort : 1;
  const minutes = Number.isFinite(+r.minutes) ? Math.max(5, Math.min(240, Math.round(+r.minutes))) : minutesOf({ effort });
  const rating = Math.min(5, Math.max(1, +r.rating || 3));
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 40);
  const notes = String(r.notes || "").slice(0, 300);

  const existing = state.recipes.find((x) => String(x.name).trim().toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.effort = effort;
    existing.minutes = minutes;
    existing.rating = rating;
    existing.ingredients = ingredients;
    existing.notes = notes;
    updated++;
  } else {
    state.recipes.push({ id: uid(), name, effort, minutes, rating, ingredients, notes, lastMade: "" });
    added++;
  }
}

let addedStaples = 0;
if (Array.isArray(input.staples)) {
  const have = new Set(state.staples.map((s) => String(s).trim().toLowerCase()));
  for (const s of input.staples) {
    const t = String(s).trim();
    if (t && !have.has(t.toLowerCase())) {
      state.staples.push(t);
      have.add(t.toLowerCase());
      addedStaples++;
    }
  }
}

const sqlPath = join(tmpdir(), "familyhub-recipes-import.sql");
const now = new Date().toISOString();
writeFileSync(
  sqlPath,
  `INSERT INTO kv (id, state, updated_at) VALUES ('family', '${esc(JSON.stringify(state))}', '${now}') ` +
    `ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at;\n`
);
run(["d1", "execute", "familyhub", "--remote", "--yes", "--file", sqlPath]);
console.log(`✓ ${added} new recipe(s), ${updated} updated, ${addedStaples} staple(s) added.`);
