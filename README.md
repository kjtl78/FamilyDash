# Family Hub on Cloudflare

Static page (`public/`) + API (`functions/api/`) + D1 database, protected by Cloudflare Access.
Cost: free tier. Read HANDOVER.md before changing anything.

## One-time setup (about 20 minutes)

You need: a free Cloudflare account, and Node.js installed on your computer.

1. Open a terminal in this folder and sign in:
   `npx wrangler login`
2. Create the database:
   `npx wrangler d1 create familyhub`
   Copy the `database_id` it prints into `wrangler.toml`.
3. Create the table:
   `npx wrangler d1 execute familyhub --remote --file=schema.sql`
4. Create the site and deploy:
   `npx wrangler pages project create familyhub --production-branch main`
   `npx wrangler pages deploy public`
   You get an address like https://familyhub.pages.dev.
   Until step 5 is done, the API refuses all requests (it fails closed), so nothing can be stored or read.

5. Protect it with Cloudflare Access (REQUIRED):
   - Cloudflare dashboard -> Zero Trust (create a free team name if asked, choose the Free plan).
   - Access -> Applications -> Add an application -> Self-hosted.
   - Domain: your Pages address (e.g. familyhub.pages.dev). Also cover its preview URLs: *.familyhub.pages.dev.
   - Policy: Allow, include "Emails" and list each family member's email.
   - Login method: One-time PIN (email code) is the simplest.
   - Save, then open the application and copy the **Application Audience (AUD) tag**.
   - Your **team domain** looks like `yourteam.cloudflareaccess.com` (Zero Trust -> Settings -> Custom pages / General).
6. Give the site those two values:
   - Workers & Pages -> familyhub -> Settings -> Variables and Secrets -> Production:
     `TEAM_DOMAIN` = yourteam.cloudflareaccess.com
     `POLICY_AUD`  = the AUD tag
   - Redeploy: `npx wrangler pages deploy public`
7. Open the site on your phone and your computer. You should be asked for your email, then get a code. The page loads and edits are shared.

## Local testing
Create `.dev.vars` with `DEV=1`, then `npx wrangler pages dev public --d1 DB=familyhub`.
Never set DEV=1 in production.

## Updating
Edit `public/index.html`, then `npx wrangler pages deploy public`.


---

## Update 2: Google Calendar, Bring!, recipes, school

New/changed files: `public/index.html`, `lib/ical.js`, `functions/api/calendar.js`, `functions/api/bring.js`, `functions/api/ideas.js`.
Also add this to the END of your existing `wrangler.toml` (do NOT replace the file, it holds your database ID):

```
[ai]
binding = "AI"
```
If the AI button later says AI is not enabled, add the binding in the dashboard instead:
Pages project -> Settings -> Bindings -> Add -> Workers AI -> variable name `AI`.

### Secrets to add (Pages project -> Settings -> Variables and Secrets -> choose type **Secret**)
| Name | Value | Needed for |
|---|---|---|
| `GCAL_ICS_URL` | Google Calendar "Secret address in iCal format" | Week-ahead calendar |
| `BRING_EMAIL` | Email of the Bring! account used for the mirror | Bring! mirror |
| `BRING_PASSWORD` | Password of that account | Bring! mirror |
| `BRING_LIST_NAME` (optional) | Exact name of the list to mirror | Bring! mirror |

Never put these in GitHub. After adding secrets, redeploy (Deployments -> Retry/redeploy, or commit any small change).

**Google Calendar link:** calendar.google.com on a computer -> Settings (gear) -> under "Settings for my calendars" pick the family calendar -> "Integrate calendar" -> copy "Secret address in iCal format". Treat it like a password; use "Reset" there if it leaks. A work/school Google account may have this switched off by its admin.

**Bring!:** there is no official API. This uses the unofficial interface that community tools and Home Assistant use, so it can break without warning. Recommended: create a second Bring! account (email + password, not "Sign in with Google/Apple"), share your family list with it from the Bring! app, accept the invite on that account, and use THAT login here. The mirror is read-only: items added in Bring! appear in the Hub.

### Checking it works
While signed in via Access, open these in the browser and look for JSON (not an error):
- `https://YOURSITE.pages.dev/api/calendar?tz=Europe/Oslo&start=2026-11-02`
- `https://YOURSITE.pages.dev/api/bring`
The message tells you what is missing (for example "GCAL_ICS_URL is not set").
