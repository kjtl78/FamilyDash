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
