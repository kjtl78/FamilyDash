# Updating the site

The whole loop is one command. The source lives on GitHub; the site is deployed directly from this Mac to Cloudflare Pages.

```bash
npm run ship -- "short description of the change"
```

That command:

1. syntax-checks every JS file and the inline script in `public/index.html` — a broken file stops before anything is committed;
2. commits everything on `main`;
3. pushes to GitHub (history and backup);
4. deploys `public/` + `functions/` directly to the **familien-ds** Pages project, then checks the live site and prints the URL.

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

- **GitHub:** `kjtl78/FamilyDash`, branch `main`. Push is history/backup; the deploy is done locally by `npm run ship`.
- **Cloudflare project:** `familien-ds` → https://familien-ds.pages.dev (direct upload, output folder `public`). The older `familyhub` project still exists as a legacy backup.
- **Database:** D1 `familyhub` (`37b2c55b-aa07-4609-94ed-7b882c060473`), binding `DB`, table `kv` — shared by both projects.
- **Access:** the family site is protected by the `cold-dust-02c3` Access team. `TEAM_DOMAIN` and `POLICY_AUD` are set on the project and in `wrangler.toml`. Add `familien-ds.pages.dev` to the Access application's domains so it is protected too.

## Secrets

Never put a secret in the repository. Set it once, in Cloudflare:

```bash
npx wrangler pages secret put GCAL_ICS_URL --project-name familien-ds
npx wrangler pages secret put BRING_EMAIL --project-name familien-ds
npx wrangler pages secret put BRING_PASSWORD --project-name familien-ds
```

Optional: `BRING_LIST_NAME`, `AI_MODEL`. Changes to secrets apply on the next deploy.

## School letter from your phone

Save the PDF from the school app's share sheet into either synced inbox:

- **iCloud Drive** → `FamilyHub/Inbox`
- **Google Drive** → `My Drive/FamilyHub/Inbox`

The Mac watcher (`scripts/school-inbox.mjs`, installed as LaunchAgent `com.familyhub.school-inbox`) detects it, extracts the layout-preserving text into `imports/pending/`, uploads the PDF to the private `SCHOOL` KV namespace, writes its `/api/pdf/...` URL into `imports/pending/<name>.json`, moves the PDF to `Processed/`, and shows a notification. Then say “new school letter” in chat; the import is reviewed and merged with `scripts/import-school.mjs`, with the PDF URL attached as a `docs` entry.

Reinstall or restart the watcher with:

```bash
./scripts/install-inbox-watcher.sh
```

## School PDF import

1. Send the week letter PDF in chat.
2. I extract the text, map each class to the child, and write a local file under `imports/` (git-ignored — it contains family data).
3. Merge it into the live Hub:

```bash
node scripts/import-school.mjs imports/week45.json
```

The importer adds missing family members, homework/activities/events, week notes (`weekNotes`: child, Monday date, text) and source PDFs; it skips duplicates and can remove stale notes (`removeNotes`). General notes are for non-school reminders only. It writes straight to D1, so the Hub shows it on the next poll.

## Rules

- `HANDOVER.md` is the project memory: append an entry for every change and keep **Current state** and **Open items** accurate.
- The repository is public. Keep family names, calendar links, passwords and tokens out of it.
- If a deploy fails, `npm run status` shows the failing commit; fix it and run `npm run ship` again. `git revert` is the fastest rollback.
