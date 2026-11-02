// One command to update the live site:
//   npm run ship -- "what changed"
//
// 1. checks every JS file (nothing is committed if a file is broken)
// 2. commits all changes on main
// 3. pushes to GitHub (keeps the history; the old familyhub project may also rebuild)
// 4. deploys public/ + functions/ directly to the familien-ds Pages project
// 5. confirms the live site answers
//
// The user only has to test the URL printed at the end.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT = "familien-ds";
const LIVE_URL = "https://familien-ds.pages.dev";

const message = process.argv.slice(2).join(" ").trim() || `Update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

function run(cmd, args, opts = {}) {
  const out = execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  return out == null ? "" : String(out).trim();
}

function git(...args) {
  return run("git", args);
}

// wrangler may be global (~/.local/bin) or local (node_modules/.bin).
const wranglerBin = [
  join(root, "node_modules", ".bin", "wrangler"),
  join(process.env.HOME || "", ".local", "bin", "wrangler"),
].find((p) => p && existsSync(p)) || "wrangler";

function liveStatus() {
  const res = spawnSync("curl", ["-sS", "-m", "10", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", LIVE_URL], {
    encoding: "utf8",
  });
  const [code = "", redirect = ""] = (res.stdout || "").trim().split(" ");
  return { code, redirect };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`\n▸ Shipping: ${message}\n`);

  console.log("1/4  Checking code…");
  run(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" });

  console.log("\n2/4  Committing…");
  git("add", "-A");
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
  if (staged.status === 0) {
    console.log("     Nothing changed since the last deploy. Live site is already current.");
  } else {
    if (!git("diff", "--cached", "--name-only").split("\n").includes("HANDOVER.md")) {
      console.log("     Note: HANDOVER.md was not updated (the project rule asks for an entry per change).");
    }
    git("commit", "-m", message);
  }
  const sha = git("rev-parse", "--short=7", "HEAD");
  console.log(`     ${sha} ${git("log", "-1", "--pretty=%s")}`);

  console.log("\n3/4  Pushing to GitHub…");
  git("push", "origin", "main");

  console.log("\n4/4  Deploying to Cloudflare…");
  run(wranglerBin, ["pages", "deploy", "public", "--project-name", PROJECT, "--branch", "main"], { stdio: "inherit" });

  let status = { code: "", redirect: "" };
  for (let i = 0; i < 8; i++) {
    status = liveStatus();
    const ok = status.code === "200" || (status.code === "302" && /cloudflareaccess\.com/.test(status.redirect));
    if (ok) break;
    await wait(2000);
  }

  const protectedByAccess = status.code === "302" && /cloudflareaccess\.com/.test(status.redirect);
  if (status.code !== "200" && !protectedByAccess) {
    console.error(`\n✗ Deployed, but ${LIVE_URL} answered ${status.code || "nothing"}.`);
    process.exit(1);
  }

  console.log(`\n✓ Live${protectedByAccess ? " (protected by Cloudflare Access)" : ""}. Test it at ${LIVE_URL}`);
  console.log(`  Commit ${sha}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
