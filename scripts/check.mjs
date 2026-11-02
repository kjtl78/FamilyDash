// Syntax-check every JavaScript file and the inline script in public/index.html.
// Run with: npm run check
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP = new Set(["node_modules", ".git", ".wrangler", ".dev.vars"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function syntaxCheck(label, file) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return true;
  } catch (e) {
    const detail = (e.stderr || e.stdout || "").toString().trim();
    console.error(`✗ ${label}`);
    if (detail) console.error(detail.split("\n").slice(0, 6).join("\n"));
    return false;
  }
}

let failures = 0;
const files = walk(root);

const jsFiles = files.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
for (const file of jsFiles) {
  if (!syntaxCheck(relative(root, file), file)) failures++;
}

const htmlPath = join(root, "public", "index.html");
const html = readFileSync(htmlPath, "utf8");
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const tmp = mkdtempSync(join(tmpdir(), "familyhub-check-"));
try {
  inline.forEach((code, i) => {
    const file = join(tmp, `inline-${i}.js`);
    writeFileSync(file, code);
    if (!syntaxCheck(`public/index.html (inline script ${i + 1})`, file)) failures++;
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

for (const name of ["package.json"]) {
  try {
    JSON.parse(readFileSync(join(root, name), "utf8"));
  } catch {
    console.error(`✗ ${name} is not valid JSON`);
    failures++;
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found. Nothing was committed.`);
  process.exit(1);
}
console.log(`✓ ${jsFiles.length} JS file(s) and ${inline.length} inline script(s) OK`);
