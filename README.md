# Limitless OS

Limitless OS is the internal app for Limitless Roofing & Restoration: jobs, customers, partners, schedules and field work in one place, for the Reading, Pennsylvania and American Fork, Utah offices. It will run alongside JobNimbus at first and take over one workflow at a time, starting with emergency services.

The full plan is in [`docs/spec.md`](docs/spec.md). The approved screen designs are in [`docs/design/`](docs/design/). You can open those files in a browser.

## What works today

Phase 1, steps 1 and 2:

- The app frame: the green sidebar with New emergency, New job or lead, and the eight menu links. On a phone it becomes a top bar with a menu button, and New emergency stays in the top bar.
- Sign-in with email and password. Nobody can sign up on their own: an Admin adds people. Anyone signed out sees only the sign-in screen.
- The sidebar shows who is signed in, their role, and a Sign out button.
- The People screen, for Admins only: everyone who can sign in, with their role, offices and whether they are switched on.
- The Office home screen, with made-up sample data: what needs attention, today's schedule and the boards. The location buttons come from the states and offices in the database.
- Every other menu link opens a page saying which step it arrives in.
- The app can be installed to a phone or iPad home screen, and it opens without signal once it has been loaded once.

Customers, jobs and the rest arrive in the next steps. The home screen numbers are still sample data.

## The database

The database is a Supabase project. Its tables, access rules and starting rows are SQL files in `supabase/migrations/`. Supabase's GitHub integration applies them when a pull request is merged. Nobody changes the database by hand in the dashboard.

### Connecting the app to Supabase

The app needs two settings, both found in the Supabase project under **Project Settings**, then **API**:

- `VITE_SUPABASE_URL`: the project URL.
- `VITE_SUPABASE_KEY`: the public key, called `anon` or `publishable`. Never the `service_role` or secret key.

They go in Cloudflare under the project's **Settings**, then **Variables and secrets** (as build variables), and in a local `.env.local` file on your computer (copy `.env.example`). They never go in this repository. If they are missing, the app shows a "Setup needed" message instead of a blank page.

### Adding people

1. In Supabase, open **Authentication**, then **Users**, then **Add user**, then **Create new user**. Enter their email and a starting password, and tick **Auto confirm user**.
2. They get a profile in Limitless OS straight away. The very first person ever added becomes Admin. Everyone after starts as Sales with no office.
3. In the app, an Admin opens **People** (under their name in the sidebar), taps the person, and sets their name, role and offices.

To stop someone signing in, switch them off on the People screen. People are never deleted, so their history stays.

Also check, in Supabase under **Authentication**, then **Sign In / Providers**, that **Allow new users to sign up** is off.

## Running it on a computer

You need [Node.js](https://nodejs.org) version 20 or newer.

```sh
npm install
npm run dev
```

Then open the address it prints, usually http://localhost:5173.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the automated checks of the business rules and screens |
| `npm run test:db` | Checks the database migrations and access rules against a local Postgres (needs Postgres installed) |
| `npm run typecheck` | Checks the code for mistakes |
| `npm run build` | Builds the finished app into the `dist` folder |
| `npm run preview` | Serves the finished build locally, to try the installable version |

## Deploying to Cloudflare

The app is a set of plain files, so Cloudflare can host it for free and redeploy each time this repository changes.

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **Workers & Pages**, choose **Create**, then **Import a repository**, and connect your GitHub account.
3. Pick the `limitless-os` repository.
4. Use these settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Leave the root folder as it is.
5. Save and deploy. Cloudflare gives you an address ending in `workers.dev`. You can attach your own domain later under **Settings**, then **Domains & Routes**.

The file `wrangler.jsonc` tells Cloudflare to serve the `dist` folder and to send every address back to the app, so links straight to a screen such as `/customers` work.

If you use a Cloudflare **Pages** project instead, set the build command to `npm run build` and the output folder to `dist`. Pages also sends unknown addresses to the app automatically.

### Settings

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` as described in [Connecting the app to Supabase](#connecting-the-app-to-supabase). The app reads them when it is built, so deploy again after changing them.

## Installing on a phone or iPad

Open the deployed address in Safari, tap Share, then **Add to Home Screen**. On Android, open it in Chrome and tap **Install app**.
