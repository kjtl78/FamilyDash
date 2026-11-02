// One command to update the live site:
//   npm run ship -- "what changed"
//
// 1. checks every JS file (nothing is committed if a file is broken)
// 2. commits all changes on main
// 3. pushes to GitHub, which makes Cloudflare Pages build and deploy
// 4. waits for that deployment and confirms the live site answers
//
// The user only has to test the URL printed at the end.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT = "familyhub";
const LIVE_URL = "https://familyhub-84t.pages.dev";
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 8000;

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

function deployments() {
  const res = spawnSync(wranglerBin, ["pages", "deployment", "list", "--project-name", PROJECT, "--environment", "production", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(res.stderr || "Could not read deployments");
  return JSON.parse(res.stdout);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n▸ Shipping: ${message}\n`);

  console.log("1/4  Checking code…");
  run(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" });

  console.log("\n2/4  Committing…");
  git("add", "-A");
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
  if (staged.status === 0) {
    console.log("     Nothing changed since the last deploy. Live site is already current.");
    return;
  }
  if (!git("diff", "--cached", "--name-only").split("\n").includes("HANDOVER.md")) {
    console.log("     Note: HANDOVER.md was not updated (the project rule asks for an entry per change).");
  }
  git("commit", "-m", message);
  const sha = git("rev-parse", "--short=7", "HEAD");
  console.log(`     ${sha} ${git("log", "-1", "--pretty=%s")}`);

  console.log("\n3/4  Pushing to GitHub (this starts the Cloudflare build)…");
  git("push", "origin", "main");

  console.log("\n4/4  Waiting for Cloudflare…");
  const deadline = Date.now() + TIMEOUT_MS;
  let found = null;
  while (Date.now() < deadline) {
    let list = [];
    try {
      list = deployments();
    } catch (e) {
      console.log(`     ${e.message.split("\n")[0]}`);
    }
    found = list.find((d) => d.Source === sha && d.Environment === "Production");
    if (found) {
      const status = String(found.Status || "");
      if (/fail/i.test(status)) {
        console.error(`\n✗ Deployment failed: ${found.Build || found.Deployment}`);
        process.exit(1);
      }
      if (!/build|queue|pending|initial|progress/i.test(status)) break;
      console.log(`     ${status || "building"}…`);
    } else {
      console.log("     Build queued…");
    }
    await sleep(POLL_MS);
  }

  if (!found) {
    console.error("\n✗ Push succeeded, but no production deployment for this commit appeared in time.");
    console.error("  The site may be built from a different Cloudflare account. Check the GitHub commit is on main.");
    process.exit(1);
  }

  const res = spawnSync("curl", ["-fsS", "-o", "/dev/null", "-w", "%{http_code}", LIVE_URL], { encoding: "utf8" });
  const code = (res.stdout || "").trim();
  if (code !== "200") {
    console.error(`\n✗ Deployed, but ${LIVE_URL} answered ${code || "nothing"}.`);
    process.exit(1);
  }

  console.log(`\n✓ Live. Test it at ${LIVE_URL}`);
  console.log(`  Commit ${sha} · deployment ${found.Deployment}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
