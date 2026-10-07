# Limitless OS

Limitless OS is the internal app for Limitless Roofing & Restoration: jobs, customers, partners, schedules and field work in one place, for the Reading, Pennsylvania and American Fork, Utah offices. It will run alongside JobNimbus at first and take over one workflow at a time, starting with emergency services.

The full plan is in [`docs/spec.md`](docs/spec.md). The approved screen designs are in [`docs/design/`](docs/design/). You can open those files in a browser.

## What works today

This is the first step of Phase 1:

- The app frame: the green sidebar with New emergency, New job or lead, and the eight menu links. On a phone it becomes a top bar with a menu button, and New emergency stays in the top bar.
- The Office home screen, with made-up sample data: what needs attention, today's schedule and the boards. The location buttons switch between all locations, Pennsylvania and Utah.
- Every other menu link opens a page saying which step it arrives in.
- The app can be installed to a phone or iPad home screen, and it opens without signal once it has been loaded once.

There is no login and no database yet. Nothing you do is saved, apart from the location you last picked on that device.

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

### Settings for later

When the database arrives in the next step, the app will need two settings: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`. They go in Cloudflare under the project's **Settings**, then **Variables and secrets**, and in a local `.env.local` file on your computer (see `.env.example`). They never go in this repository.

## Installing on a phone or iPad

Open the deployed address in Safari, tap Share, then **Add to Home Screen**. On Android, open it in Chrome and tap **Install app**.
