# Family Hub: Handover Log

Purpose: let any person or model resume this project at any time.
Rules for whoever edits this project:
1. Read this whole file first.
2. After EVERY change, append an entry to the Change log (newest at the bottom). Never rewrite or delete old entries.
3. Update "Current state" and "Open items" so they always reflect reality.
4. Keep the latest copy of this file with the code. The Claude container resets between sessions.

---

## Goal
An editable (not read-only) family dashboard for desktop AND mobile, used by the whole household.
Needs: calendar, meal planner, shopping list, chores, notes/contacts, and information from existing tools.

## User context (stated by the user)
- Family currently uses **Google Calendar** and the **Bring!** shopping app.
- Kids' homework and school plan are published as a **PDF**.
- User wants it **hosted outside Claude**. Leaning towards **Cloudflare**. Google Drive was asked about: it cannot serve web pages, storage only.
- Must be usable on both desktop and mobile.
- User wants every change recorded in this log.
- Work account (organisation: 4subsea). Org sharing settings may limit who can open the Claude-hosted link.

## Current state (update this section on every change)
- Status: LIVE. GitHub `kjtl78/FamilyDash` (branch `main`, public) is Git-connected to Cloudflare Pages project `familyhub` → https://familyhub-84t.pages.dev. Latest verified deploy `8a55329` was live on 2026-11-02; every push to `main` rebuilds and deploys.
- Family site: https://familyhub-84t.pages.dev is the chosen household site, protected by Cloudflare Access team `cold-dust-02c3` (application AUD `8ba3272a992d27f6fe1b07b5c29d109f607a6767d0f7d5156e9cf9de8f87d32c`). The login method is **Sign in with Cloudflare**. The older `familydash.pages.dev` site (Access team `lionfishky`) belongs to a different account and is no longer used.
- Update loop: `npm run ship -- "message"` checks, commits, pushes, waits for the deployment and verifies the site (`WORKFLOW.md`).
- Cloudflare project layout: `public/index.html`, `functions/api/_middleware.js` (Access JWT check, fails closed), `functions/api/state.js` (GET/PUT, D1), `lib/ical.js`, `functions/api/calendar.js`, `functions/api/bring.js`, `functions/api/ideas.js`, `schema.sql`, `wrangler.toml`, `scripts/check.mjs`, `scripts/ship.mjs`, `README.md`, `WORKFLOW.md`.
- Tabs: Today, Calendar, Meals (planner + recipes + AI ideas), Shopping (Bring! mirror + Hub list), School, More (chores, notes, contacts, backup).
- Storage: `GET/PUT /api/state` against D1 table `kv` (row id `family`), client polls every 15 s and on focus; last writer wins.
- Config: D1 binding `DB` and table `kv` exist; KV binding `SCHOOL` points at namespace `familyhub-school` (`99c2fdf65a324d1f8343aa581184f2cb`); `TEAM_DOMAIN` = `cold-dust-02c3.cloudflareaccess.com` and `POLICY_AUD` = `8ba3272a…f87d32c` are set on the Pages project; the `AI` binding exists. Important: Pages Git builds ignore `[vars]`, and KV bindings from `wrangler.toml` did not apply either, so these were set through the Pages API. `GCAL_ICS_URL` is set; `BRING_EMAIL` / `BRING_PASSWORD` are not, so Bring! returns 501.
- Google Calendar: connected read-only via the `GCAL_ICS_URL` secret (calendar “Familien DDS”, 493 events). The real feed was parsed locally with `lib/ical.js`; the UI verification still needs a logged-in session.
- Live data: family members Solvei (1. trinn) and Ellinor (4. trinn); the week 45 school plan is imported (14 items) plus 3 notes. Ellinor is in B class, so the week 46 gym reminder is on Monday 9.11.
- School-letter intake: share a PDF from the phone into iCloud Drive `FamilyHub/Inbox` or Google Drive `My Drive/FamilyHub/Inbox`. The LaunchAgent watcher `com.familyhub.school-inbox` extracts it into `imports/pending/`, uploads the PDF to KV, and notifies; the import is reviewed before it is merged.
- Source PDFs: stored in the private KV namespace `familyhub-school` (binding `SCHOOL`) and served at `/api/pdf/<key>` behind Cloudflare Access. Week 45 letters are attached to Solvei and Ellinor in the School tab.

## Architecture
- One HTML file, no build step. Tabs: Today, Calendar, Meals, Shopping, Chores, Info (notes and contacts).
- Responsive: bottom tab bar, 44px touch targets, 16px inputs and day-by-day meal cards at max-width 700px; multi-column layout above 900px. Light and dark mode via CSS variables.
- **Persistence (Claude-hosted only):** Claude Artifact `db` capability. One document `family/state` containing `{state: "<JSON string>"}`. Subscribed once with `onSnapshot`; writes are debounced (450 ms) and serialised (one write at a time). If `db` is unavailable, falls back to `localStorage` key `familyhub-state` with a banner.
- **Outside Claude the `db` capability does not exist.** The storage layer (functions `initStorage`, `flush`, `applyRemote` in the script) must be replaced with calls to a real backend.

### Data model (the JSON inside `state`)
```
members:  [{id, name, color}]
events:   [{id, date "YYYY-MM-DD", time "HH:MM"|"", title, who (member id|"")}]
meals:    { "YYYY-MM-DD": {b, l, d} }   // breakfast, lunch, dinner text
shopping: [{id, text, cat, done}]       // cat in Produce, Dairy & eggs, Meat & fish, Pantry, Frozen, Household, Other
chores:   [{id, text, who, done}]
notes:    [{id, text}]
contacts: [{id, name, phone}]
```

## Decisions and rationale
- No ready-made "Dashboard" artifact type existed in this account, so the page is hand-written HTML.
- Whole state kept in one document for simplicity; last writer wins. Fine for a family, revisit if conflicts appear.
- Google Drive rejected as host (cannot serve HTML as a site).
- Bring!: no connector found, no official public API known. Plan: "copy list" button to paste/import into Bring!.
- School PDF: plan is to read it in chat and populate homework (as chores per child) and school dates (as events), plus store/link the latest PDF.

## Hosting plan (confirmed: Cloudflare; not yet built)
Recommended: **Cloudflare Pages** + **Pages Functions** + **D1** (or KV) for shared state + **Cloudflare Access** to restrict to family emails.
- `GET /api/state` returns the state JSON; `PUT /api/state` replaces it. Client polls every ~10 s and on focus.
- Google Calendar: first version read-only via the calendar's private iCal feed fetched by a Pages Function; two-way editing needs Google OAuth (later).
- School PDF: store in R2 or link to the published URL.
- Alternative: Firebase Hosting + Firestore (simpler live sync, Google sign-in).

## Open items
- [x] Hosting choice confirmed by user: Cloudflare (Entry 5).
- [x] Build deploy-ready Cloudflare project (Entry 6).
- [x] Site deployed via GitHub + Cloudflare Git integration (Entries 7, 9).
- [x] Copy Hub list button added (Entry 8).
- [x] School calendar + JSON import added (Entry 8). PDFs are read in chat, not by the app.
- [x] Update 2 deployed (Entry 9).
- [x] One-command update workflow added: `npm run ship` (Entry 9).
- [x] Household site chosen: `familyhub-84t.pages.dev`. The old `familydash.pages.dev` account is no longer used.
- [x] Access added to `familyhub-84t.pages.dev` (team `cold-dust-02c3`, app AUD `8ba3272a…f87d32c`); login method is Cloudflare.
- [ ] Add the remaining family members to the Access policy (only `sagstad@gmail.com` is allowed so far).
- [ ] Consider making the GitHub repository private (currently public; keep secrets and family data out).
- [x] Add `GCAL_ICS_URL` secret; the real “Familien DDS” feed (493 events) parses correctly with `lib/ical.js`.
- [ ] Confirm the Calendar tab shows the next 7 days after logging in.
- [ ] Add `BRING_EMAIL` / `BRING_PASSWORD` secrets and verify `/api/bring` (unofficial API, untested).
- [ ] Verify the Workers AI binding and model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` after the first deploy (override with `AI_MODEL`).
- [ ] Privacy guardrails from Entry 5 (Access on both site and `/api/*`, no trackers, minimal data).
- [x] Weekly school import: week 45 loaded for Solvei (1. trinn) and Ellinor (4. trinn); `scripts/import-school.mjs` makes future weeks one command.
- [x] Source PDFs stored in KV `familyhub-school` and linked from the School tab for week 45.
- [ ] Verify the “Open PDF” links work after signing in.
- [ ] R2 is not enabled on the account; KV is used for school PDFs (fine for small files).
- [x] Ellinor is in B class; the week 46 gym reminder is set for Monday 9.11 (gymtøy, håndkle, såpe).
- [ ] Test the iPhone share-to-inbox flow end to end (school app → Save to Files/Drive → `FamilyHub/Inbox`).
- [ ] Decide later whether AI-assisted auto-import is trusted enough; it misread the 1st-grade columns once, so imports stay reviewed for now.
- [ ] Optional: birthdays, recurring chores, pinned weekly menu, shopping list download, conflict-safe saves.

---

## Change log (append only)

### 2026-11-02 · Entry 1 · Initial build
- Created `family-dashboard.html`: tabs for Today, Calendar, Meals, Shopping, Chores, Info; editable add, tick and delete everywhere; family members with colours.
- Persistence via Claude Artifact `db` (`family/state`), with localStorage fallback.
- Published as Claude artifact (URL above) with capability `db`.

### 2026-11-02 · Entry 2 · Mobile and desktop tailoring
- Added bottom tab bar on mobile, larger touch targets, 16px inputs (avoids iOS zoom), safe-area padding.
- Mobile meal planner as per-day cards; desktop keeps weekly grid.
- Calendar shows dots on mobile, event titles on desktop. Wider layout above 900px.
- Republished to same URL via the Artifact `edit` action.

### 2026-11-02 · Entry 3 · Integrations discussion
- User stated Google Calendar, Bring! and a school PDF are in use.
- Searched connector directory: Google Calendar connector exists (not connected); no Bring! connector found.
- Suggested Google Calendar connector to user. No code changed.

### 2026-11-02 · Entry 4 · Hosting discussion and handover log
- User wants it hosted outside Claude (leaning Cloudflare) and a handover log of every change.
- Recommended Cloudflare Pages + Functions + D1 + Access; Firebase as alternative; Google Drive ruled out.
- Created this `HANDOVER.md`. No code changed.

### 2026-11-02 · Entry 5 · Cost, jurisdiction and privacy discussion
- User asked whether Firebase and Cloudflare are American (both are US companies; EU region only controls storage location, not legal jurisdiction) and which is cheapest and easiest to maintain.
- Web search (third-party pricing pages, not verified against Cloudflare's own site): Pages static hosting free; Pages Functions/Workers free tier 100K requests/day; D1 free daily limits 5M rows read, 100K rows written, 5 GB; Access free up to 50 users. Re-verify on cloudflare.com before relying on it.
- DECISION: user chose Cloudflare. Calendar approach still undecided; default to read-only Google Calendar private iCal feed.
- Privacy guardrails to implement in the build:
  1. Cloudflare Access in front of BOTH the site and /api/*, allow-list of family emails only (user must configure; until then the site is public).
  2. Calendar feed URL stored as a Cloudflare secret, fetched server-side by a Function, never shipped to the browser or committed.
  3. No analytics, trackers, third-party scripts or fonts.
  4. Minimal data: first names only; do not store addresses, IDs, medical or financial details; school PDF stays private.
  5. Export/backup button (JSON download) so data is not locked in.
  6. Consider D1 EU jurisdiction/location option and Cloudflare DPA if EU residency matters; verify current availability.
- No code changed.

### 2026-11-02 · Entry 6 · First Cloudflare build
- Created project: `public/index.html` (same UI as the Claude version; storage layer replaced by fetch to `/api/state` with polling), `functions/api/_middleware.js` (verifies Cloudflare Access JWT using TEAM_DOMAIN and POLICY_AUD, RS256 via WebCrypto; refuses with 503 until configured; `DEV=1` bypass for local only), `functions/api/state.js`, `schema.sql`, `wrangler.toml`, `README.md`, `.gitignore`.
- Added `<meta name="robots" content="noindex,nofollow">`.
- Syntax-checked the JS with node only. NOT run against real Cloudflare or tested in a browser; the Access JWT verification in particular is untested.
- Known gaps: no export/backup button yet, no Google Calendar, no Bring! copy button, no school PDF yet. Whole-state last-writer-wins can overwrite simultaneous edits.

### 2026-11-02 · Entry 7 · Files uploaded to GitHub
- User uploaded the project to a private GitHub repository (`kjtl78/FamilyDash`); no Node.js available without admin rights, so deployment is via GitHub + Cloudflare dashboard, not wrangler.
- First deploy failed ("Output directory public not found") because folders were not at the repo root; user fixed it and the site is published.

### 2026-11-02 · Entry 8 · Update 2: calendar, dinner planner, school, Bring! mirror
User decisions: Bring! must flow INTO the Hub (read-only mirror); school PDFs are read by Claude in chat and imported as JSON; new-meal ideas come from a built-in Cloudflare AI button (no web access).
Added:
- `lib/ical.js` + `functions/api/calendar.js`: reads private Google Calendar iCal feed (secret `GCAL_ICS_URL`), returns next 7 days in the viewer's time zone. Supports RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY incl. ordinals, BYMONTHDAY), EXDATE, RECURRENCE-ID overrides, all-day and TZID/UTC events. Not supported: RDATE, BYSETPOS. Tested on a sample .ics only, not on the real Google feed.
- `functions/api/bring.js`: read-only mirror via Bring!'s UNOFFICIAL API (POST /rest/v2/bringauth; GET bringusers/{uuid}/lists; GET bringlists/{listUuid}); secrets `BRING_EMAIL`, `BRING_PASSWORD`, optional `BRING_LIST_NAME`; API key is Bring!'s public web-client key (override with `BRING_API_KEY`). Untested against the real service. Item names are Bring! catalog keys or user text, not localised.
- `functions/api/ideas.js`: Workers AI (binding `AI`, default model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, override `AI_MODEL`) returns 4 JSON dish ideas given liked recipes, all recipes, staples and rejected names. No web access.
- Front end: recipe book (name, effort 1-3, rating 1-5, ingredients one per line, notes, last made), editable "everyday ingredients" list, dinner suggester (scores: rating, days since last made, effort with weekday penalty, number of non-everyday ingredients, overlap of ingredients with dishes already picked, random jitter; "Fill empty dinners" and "Re-suggest all"), "Add special ingredients to Hub list", AI idea cards with Add / Not for us, School tab (week view per child, homework tick boxes, activities, manual add), JSON import, Google Calendar and Bring! cards, Hub list copy button, backup download, More tab replacing Chores and Info tabs.
- Tested with a fake DOM and fake API responses in node (all checks passed); NOT tested in a real browser, on a phone, or against Google, Bring! or Workers AI.
- `wrangler.toml` needs `[ai]\nbinding = "AI"` appended by the user; the copy in this folder still has the placeholder database_id, never overwrite the user's version.

School import format (for any model asked to convert a school PDF): output ONLY a JSON array, dates ISO, child names exactly as in the Hub, type one of homework|activity|event:
`[{"child":"Emma","date":"2026-11-03","type":"homework","title":"Maths p.45","subject":"Maths"}]`
Ask the user for the children's first names if not known; skip anything ambiguous and list it separately.

### 2026-11-02 · Entry 9 · One-command update workflow
- Retrieved the project from GitHub into `/Users/kjtl/FamilyDash`; push access confirmed as `kjtl78`.
- Installed Node LTS 26.13.0 and wrangler 4.156.2 inside `~/.local` (no admin rights). Publishing now needs no manual upload: `npm run ship -- "message"` checks, commits, pushes, waits for the Pages build and verifies the live site.
- Added `scripts/check.mjs` (syntax check for all JS plus the inline script in `public/index.html`), `scripts/ship.mjs`, `package.json` scripts, `WORKFLOW.md`, and a short update section in `README.md`.
- Cloudflare account `sagstad@gmail.com` (`d590e1e7a0695bc1d6109dbaedd984ac`) owns Pages project `familyhub` → `familyhub-84t.pages.dev`, Git-connected to `main`. Latest deploy source `90d9e1b` matched repo HEAD. D1 `familyhub` contains table `kv`.
- `/api/*` on `familyhub-84t.pages.dev` returned 503 because `TEAM_DOMAIN`/`POLICY_AUD` were unset. Added them and the `[ai]` binding to `wrangler.toml`.
- `familydash.pages.dev` is behind Access team `lionfishky` but is NOT in this Cloudflare account (only one membership is visible). Its AUD tag was used for `POLICY_AUD`.
- `familyhub-84t.pages.dev` is currently public and unprotected; the API still refuses without an Access JWT. The GitHub repository is also public.
- Still unverified when this entry was written: the first `npm run ship` deployment, the Access-protected site, the AI model name, Google Calendar and Bring! (secrets missing).

### 2026-11-02 · Entry 10 · Workflow proven; Cloudflare config applied
- First `npm run ship -- "Add one-command update workflow"` succeeded: commit `f5b4fef`, push to `main`, Cloudflare build `4b915ac2`, live check `200`. The loop now works end to end.
- `/api/*` still returned 503 after that deploy. Pages **Git builds do not apply `[vars]` from `wrangler.toml`** (D1 and the AI binding did apply). Set `TEAM_DOMAIN` and `POLICY_AUD` on the Pages project through the API; retried the deployment.
- After the retry, the project has `env_vars` `TEAM_DOMAIN`, `POLICY_AUD`, D1 `DB`, and `ai_bindings` `AI`. `/api/state` now returns **401 Unauthorized** without an Access JWT, which is the expected closed state.
- Unresolved: the account we control owns `familyhub-84t.pages.dev` only. `familydash.pages.dev` (Access team `lionfishky`) is in a different Cloudflare account, so a push from here may not update that site. Decide which one is the household site.
- `familyhub-84t.pages.dev` remains public and has no Access application, so its API refuses saves. It is a working deployment target, not yet a usable family site.
- AI model name `@cf/meta/llama-3.3-70b-instruct-fp8-fast` still unverified; the binding exists.

### 2026-11-02 · Entry 11 · Access moved to the household account
- User enabled Cloudflare Access on `familyhub-84t.pages.dev` in the `sagstad@gmail.com` account. New team `cold-dust-02c3.cloudflareaccess.com`; application AUD `8ba3272a992d27f6fe1b07b5c29d109f607a6767d0f7d5156e9cf9de8f87d32c`; the only login method shown is **Sign in with Cloudflare**.
- Replaced the old `lionfishky` / `b8e436…` values in `wrangler.toml` and on the Pages project with the new team and AUD. D1 `DB` and AI `AI` bindings preserved.
- `familydash.pages.dev` and its `lionfishky` Access team belong to a different account and are no longer part of this project.
- Still to verify after this deploy: a real login through Access, saving/loading state, and the AI ideas button.

### 2026-11-02 · Entry 12 · Deploy check now understands Access
- `scripts/ship.mjs` required the live URL to answer `200`. With Access enabled the site correctly answers `302` to the login page, so the workflow stopped reporting success. The check now treats a `302` to `*.cloudflareaccess.com` as a successful, protected deploy.
- Verified after deploy `8a55329`: site answers `302` → `cold-dust-02c3.cloudflareaccess.com`; the login page answers `200` and offers **Sign in with Cloudflare**; project vars `TEAM_DOMAIN` / `POLICY_AUD` are the new values; D1 `DB` and AI `AI` bindings survived the deploy.
- Pending user test: sign in with Cloudflare, save something, reload, and confirm it persists.

### 2026-11-02 · Entry 13 · Fix form fields clearing while typing
- Reported: typing a new recipe cleared the fields at random. Cause: `pull()` repainted the whole view after every 15 s poll, even when the remote state had not changed. Recipe inputs live only in the DOM until **Add recipe** is pressed, so the repaint rebuilt them empty.
- `pull()` now repaints only on first load or when the fetched state actually differs; remote changes use `softRender()`, which already skips while an input is focused.
- Needs user verification: type a recipe slowly for more than 30 s and confirm nothing clears.

### 2026-11-02 · Entry 14 · Google Calendar connected; week 45 school plan imported
- Read the secret iCal address from the user's Desktop file and stored it as the `GCAL_ICS_URL` secret on the Pages project. Feed is “Familien DDS” with 493 events; `expandWeek` returned 9 events for 2–8 Nov 2026, so the parser handles the real calendar. The secret was set after the last deploy, so it takes effect on the next deploy.
- Added `scripts/import-school.mjs` (merges members, school items and notes into the live D1 `kv` state, skipping duplicates) and documented it in `WORKFLOW.md`. Import JSON files live in the git-ignored `imports/` folder because they contain family data.
- Imported week 45: members Solvei (1. trinn) and Ellinor (4. trinn); 8 school items for Solvei, 6 for Ellinor, plus 3 notes (weekly goals, English vocabulary, week 46 gym day). Corrected the earlier guess: 1. trinn is Solvei, 4. trinn is Ellinor.
- PDF text was extracted locally with `pypdf`; the model cannot read PDF attachments directly.
- Updated the School tab instruction text to say the PDF is imported in chat.
- Open: Ellinor's A/B class for the week 46 gym day; confirm the Calendar tab after logging in.

### 2026-11-02 · Entry 15 · One-share school-letter inbox
- Created synced inboxes: iCloud Drive `FamilyHub/Inbox` and Google Drive `My Drive/FamilyHub/Inbox`, each with `Processed/`.
- Added `scripts/school-inbox.mjs` and `scripts/install-inbox-watcher.sh`; installed the user LaunchAgent `com.familyhub.school-inbox` (RunAtLoad, KeepAlive) watching both inboxes every 20 s. It waits for cloud sync to settle, extracts layout-preserving text with pypdf into `imports/pending/`, moves the PDF to `Processed/`, records a SHA-256 in `~/.local/state/familyhub/processed.json`, and shows a macOS notification.
- Tested with `Ukebrev 45.pdf` dropped into the iCloud inbox: 2,510 characters extracted and the PDF moved. Test artefacts removed and state reset.
- Auto-import is deliberately not enabled: Workers AI extraction was good for the 4th-grade letter but misread the 1st-grade homework columns and occasionally added items not in the letter. Imports stay reviewed with `scripts/import-school.mjs`.
- The Mac must be awake to process; the cloud delivers the file whenever it wakes.
- Open: the user tests the iPhone share sheet into `FamilyHub/Inbox`.

### 2026-11-02 · Entry 16 · Source school PDFs behind Access
- Created KV namespace `familyhub-school` (`99c2fdf65a324d1f8343aa581184f2cb`) and bound it as `SCHOOL` on the Pages project. Git builds did not apply the KV binding from `wrangler.toml`, so it was set through the Pages API (`kv_namespaces` → `{namespace_id}`).
- Added `functions/api/pdf/[key].js`. The existing `/api/*` middleware requires an Access session, so the PDF links are private and stable.
- Added `docs` to the app state and a “Source letters” card in the School tab, filtered by child.
- Uploaded the two week 45 letters to KV and attached them: `/api/pdf/school-week45-solvei.pdf` (Solvei) and `/api/pdf/school-week45-ellinor.pdf` (Ellinor).
- Extended `scripts/import-school.mjs` to merge `docs`, and `scripts/school-inbox.mjs` to upload each new PDF to KV and write `imports/pending/<name>.json` with its URL.
- R2 is not enabled on this account; KV is used instead. Open: verify the PDF links after login.

### 2026-11-02 · Entry 17 · Ellinor's week 46 gym day
- User confirmed Ellinor is in **B class**.
- Added a School activity for Ellinor on 2026-11-09: “Gym: ta med gymtøy, håndkle og såpe (B-klassen)”.
- Replaced the generic week 46 note with “Uke 46 · Ellinor (B-klasse): gymdag mandag 9.11. Ta med gymtøy, håndkle og såpe.”
- Extended `scripts/import-school.mjs` with `removeNotes`, so a correction can replace a stale note instead of piling up duplicates.
- Still pending: the iPhone share-sheet test and checking the PDF links after login.

### 2026-11-02 · Entry 18 · Dense one-screen layout
- Replaced the vertical 7-day Google Calendar card with a horizontal 7-column strip (`gcalWeek`). Each day is one column; up to 4 events plus a `+n` count; long titles truncate with a tooltip.
- Replaced the School tab's vertical day list with a compact grid: rows = children, columns = Mon–Fri (`schoolWeekTable`). Homework keeps its checkbox; activities/events keep icons; delete is a small × in the corner.
- Today now starts with the calendar strip and the current-week ukeplan, then meals/shopping/chores/family. Removed the duplicate “Today” and “Coming up” cards.
- School source PDFs are compact links under the grid; the add/import forms are collapsed in `<details>`.
- Mobile: both week strips scroll horizontally; the rest stacks. Verified locally with the real D1 state at desktop and mobile widths, and with the real iCal feed via a temporary `.dev.vars` (DEV=1, local only).
- `.openchamber/` (local screenshots) is now git-ignored.
