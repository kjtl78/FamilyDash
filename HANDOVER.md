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
- Status: Cloudflare project built (`/familyhub` zip), NOT yet deployed by the user. Claude-hosted prototype still exists as a fallback.
- Artifact URL: https://claude.ai/artifact/2peaZ8Y5AuxC7wfqsZNvr5
- Source file: `family-dashboard.html` (single self-contained file, vanilla JS, no dependencies).
- Cloudflare project layout: `public/index.html`, `functions/api/_middleware.js` (Access JWT check, fails closed), `functions/api/state.js` (GET/PUT, D1), `schema.sql`, `wrangler.toml` (database_id placeholder), `README.md` (setup steps).
- Storage outside Claude: `GET/PUT /api/state` against D1 table `kv` (row id `family`), client polls every 15 s and on focus; last writer wins.
- Google Calendar connector: suggested to the user, connection not confirmed.

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
- [ ] Privacy guardrails to implement in the Cloudflare build (see Entry 5).
- [ ] User to connect Google Calendar connector (or choose iCal feed approach).
- [ ] User to provide the school/homework PDF (or its URL) and the children's names.
- [x] Build deploy-ready Cloudflare project (Entry 6).
- [ ] User to deploy following README and confirm the front page works on phone and desktop.
- [ ] Add "copy shopping list" button for Bring!.
- [ ] Add school PDF link/storage and homework import.
- [ ] Optional: birthdays, recurring chores, pinned weekly menu, shopping list download.

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
