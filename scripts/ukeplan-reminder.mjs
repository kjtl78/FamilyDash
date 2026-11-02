// Weekly ukeplan check. If the upcoming school week has no school items in D1,
// create a Reminder (syncs to iPhone) and a macOS notification.
//
// Manual run: node scripts/ukeplan-reminder.mjs
// Installed as LaunchAgent com.familyhub.ukeplan-reminder (Sundays 18:00).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler =
  [
    join(root, "node_modules", ".bin", "wrangler"),
    join(process.env.HOME || "", ".local", "bin", "wrangler"),
  ].find((p) => p && existsSync(p)) || "wrangler";

function run(args) {
  const res = execFileSync(wrangler, args, { cwd: root, encoding: "utf8" });
  return res == null ? "" : String(res);
}
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - w);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y) / 86400000 + 1) / 7);
}
const notify = (message) =>
  spawnSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Family Hub"`], { stdio: "ignore" });

const raw = JSON.parse(
  run(["d1", "execute", "familyhub", "--remote", "--json", "--command", "SELECT state FROM kv WHERE id='family';"])
);
const row = raw[0]?.results?.[0];
const state = row?.state ? JSON.parse(row.state) : null;
const mon = addDays(mondayOf(new Date()), 7);
const start = iso(mon);
const end = iso(addDays(mon, 4));
const week = isoWeek(mon);

const items = state ? (state.school || []).filter((x) => x.date >= start && x.date <= end) : [];
const hasPlan = items.some((x) => x.type === "homework") || items.length >= 3;
if (hasPlan) {
  console.log(`Uke ${week} (${start}) already has school items.`);
  process.exit(0);
}

const pendingDir = join(root, "imports/pending");
let pending = [];
if (existsSync(pendingDir)) {
  const cutoff = Date.now() - 8 * 86400000;
  pending = readdirSync(pendingDir)
    .filter((f) => f.endsWith(".txt"))
    .filter((f) => {
      try {
        return statSync(join(pendingDir, f)).mtimeMs > cutoff;
      } catch {
        return false;
      }
    });
}

const message = pending.length
  ? `Uke ${week}: et ukebrev venter i imports/pending – si fra for import.`
  : `Uke ${week} mangler: del ukebrevet til FamilyHub/Inbox.`;
notify(message);

const name = `Hent ukeplan for uke ${week}`;
const script = [
  'tell application "Reminders"',
  '  if not (exists list "Family Hub") then make new list with properties {name:"Family Hub"}',
  "  set d to current date",
  "  set hours of d to 19",
  "  set minutes of d to 0",
  "  set seconds of d to 0",
  `  make new reminder at list "Family Hub" with properties {name:${JSON.stringify(name)}, due date:d}`,
  "end tell",
].join("\n");
const res = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
if (res.status !== 0) console.error(`Reminders failed: ${(res.stderr || "").trim()}`);
console.log(message);
