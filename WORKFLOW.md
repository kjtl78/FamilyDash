# Updating the site

The whole loop is one command. The site is built and deployed by Cloudflare from GitHub, so a push to `main` is a release.

```bash
npm run ship -- "short description of the change"
```

That command:

1. syntax-checks every JS file and the inline script in `public/index.html` — a broken file stops before anything is committed;
2. commits everything on `main`;
3. pushes to GitHub, which triggers the Cloudflare Pages build;
4. waits for the production deployment for that commit, checks the live site returns `200`, and prints the URL.

At the end it prints **✓ Live** plus the address to test. Nothing else is needed on the phone or the computer.

## What the user does

Wait for **✓ Live**, open the printed URL, try the changed feature. If something is wrong, say what you saw; the fix is another `npm run ship` run.

## Useful one-off commands

| Command | What it does |
|---|---|
| `npm run check` | Syntax check only, no commit or deploy |
| `npm run status` | Recent Cloudflare deployments and their commits |
| `npm run dev` | Local preview at http://localhost:8788 (needs `.dev.vars` with `DEV=1`) |
| `npm run db:init` | Create the `kv` table in the remote D1 database (already done) |
| `npm run deploy` | Direct upload with wrangler, bypassing GitHub (fallback only) |

## Where things run

- **GitHub:** `kjtl78/FamilyDash`, branch `main`. Every commit on `main` is production.
- **Cloudflare project:** `familyhub` → https://familyhub-84t.pages.dev (Git-connected, output folder `public`).
- **Database:** D1 `familyhub` (`37b2c55b-aa07-4609-94ed-7b882c060473`), binding `DB`, table `kv`.
- **Access:** the family site `familydash.pages.dev` is protected by the `lionfishky` Access team. `TEAM_DOMAIN` and `POLICY_AUD` are in `wrangler.toml`, so API requests from the protected site are verified.

## Secrets

Never put a secret in the repository. Set it once, in Cloudflare:

```bash
npx wrangler pages secret put GCAL_ICS_URL --project-name familyhub
npx wrangler pages secret put BRING_EMAIL --project-name familyhub
npx wrangler pages secret put BRING_PASSWORD --project-name familyhub
```

Optional: `BRING_LIST_NAME`, `AI_MODEL`. Changes to secrets apply on the next deploy.

## School PDF import

1. Send the week letter PDF in chat.
2. I extract the text, map each class to the child, and write a local file under `imports/` (git-ignored — it contains family data).
3. Merge it into the live Hub:

```bash
node scripts/import-school.mjs imports/week45.json
```

The importer adds missing family members, adds homework/activities/events, skips duplicates, and appends notes. It writes straight to D1, so the Hub shows it on the next poll.

## Rules

- `HANDOVER.md` is the project memory: append an entry for every change and keep **Current state** and **Open items** accurate.
- The repository is public. Keep family names, calendar links, passwords and tokens out of it.
- If a deploy fails, `npm run status` shows the failing commit; fix it and run `npm run ship` again. `git revert` is the fastest rollback.
