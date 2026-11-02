// Watch the cloud inboxes for school week-letter PDFs.
// Extracts the text (layout-preserving) into imports/pending/ and shows a notification.
// It does NOT import automatically: the AI misread a column layout once, so imports are
// reviewed before they touch the children's homework.
//
// Run in the foreground: node scripts/school-inbox.mjs
// Installed as a LaunchAgent by scripts/install-inbox-watcher.sh
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const HOME = homedir();
const ROOT = join(HOME, "FamilyDash");
const STATE = join(HOME, ".local/state/familyhub/processed.json");
const PENDING = join(ROOT, "imports/pending");
const PY = join(HOME, ".local/share/familyhub/venv/bin/python");

const INBOXES = [
  join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/FamilyHub/Inbox"),
  ...(existsSync(join(HOME, "Library/CloudStorage"))
    ? readdirSync(join(HOME, "Library/CloudStorage"))
        .filter((name) => name.startsWith("GoogleDrive-"))
        .map((name) => join(HOME, "Library/CloudStorage", name, "My Drive/FamilyHub/Inbox"))
    : []),
];

const POLL_MS = 20_000;
const SETTLE_MS = 6_000;

mkdirSync(PENDING, { recursive: true });
mkdirSync(join(HOME, ".local/state/familyhub"), { recursive: true });

const processed = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const seen = new Map();
const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

function notify(message) {
  spawnSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Family Hub"`], {
    stdio: "ignore",
  });
}

function extractText(file) {
  const code = [
    "import sys",
    "from pypdf import PdfReader",
    "r = PdfReader(sys.argv[1])",
    "print('\\n'.join((p.extract_text(extraction_mode='layout') or '') for p in r.pages))",
  ].join("\n");
  return execFileSync(PY, ["-c", code, file], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function handle(file, inbox) {
  const name = basename(file);
  const hash = sha256(file);
  if (processed[hash]) {
    log(`already processed, moving aside: ${name}`);
    renameSync(file, join(inbox, "Processed", `${stamp()}-${name}`));
    return;
  }

  let text = "";
  try {
    text = extractText(file).trim();
  } catch (e) {
    log(`could not read ${name}: ${e.message.split("\n")[0]}`);
    notify(`Could not read ${name}. Is it a scanned image?`);
    const failed = join(inbox, "Failed");
    mkdirSync(failed, { recursive: true });
    renameSync(file, join(failed, `${stamp()}-${name}`));
    return;
  }

  if (text.length < 50) {
    log(`no text in ${name} (${text.length} chars)`);
    notify(`${name} has no readable text.`);
    const failed = join(inbox, "Failed");
    mkdirSync(failed, { recursive: true });
    renameSync(file, join(failed, `${stamp()}-${name}`));
    return;
  }

  const out = join(PENDING, `${stamp()}-${name.replace(/\.pdf$/i, "")}.txt`);
  writeFileSync(out, text);
  renameSync(file, join(inbox, "Processed", `${stamp()}-${name}`));
  processed[hash] = { name, at: new Date().toISOString(), text: out };
  writeFileSync(STATE, JSON.stringify(processed, null, 2));

  log(`extracted ${name} -> ${out} (${text.length} chars)`);
  notify(`New school letter: ${name}. Ready to import.`);
}

function scan() {
  for (const inbox of INBOXES) {
    if (!existsSync(inbox)) continue;
    for (const name of readdirSync(inbox)) {
      if (!/\.pdf$/i.test(name)) continue;
      const file = join(inbox, name);
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {
        continue;
      }
      if (size === 0) continue;

      // Wait for the cloud download/sync to finish before reading.
      const prev = seen.get(file);
      if (!prev || prev.size !== size) {
        seen.set(file, { size, at: Date.now() });
        continue;
      }
      if (Date.now() - prev.at < SETTLE_MS) continue;

      try {
        handle(file, inbox);
      } catch (e) {
        log(`error on ${name}: ${e.message.split("\n")[0]}`);
      }
      seen.delete(file);
    }
  }
}

log(`watching ${INBOXES.length} inbox(es)`);
for (const inbox of INBOXES) log(`  ${inbox}${existsSync(inbox) ? "" : " (missing)"}`);
scan();
setInterval(scan, POLL_MS);
