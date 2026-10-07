# Limitless OS

The source of truth for this project is [`docs/spec.md`](docs/spec.md). Read it before starting any task. Where the spec and a guess disagree, the spec wins. The approved mockups are in [`docs/design/`](docs/design/).

## Working rules for Claude Code

From section 4 of the spec.

- The owner is the product owner, not a developer. Write pull request descriptions in plain business language: what changed, how to check it by tapping through the app, and anything you were unsure about.
- One feature per pull request. Keep them small.
- Stay inside the current phase and step. Do not build ahead.
- If a business rule is unclear or missing, do not guess. Build the rest and list the question in the pull request.
- Every table gets row level security, the standard columns, and an audit trigger where section 7 says so.
- Never commit secrets or real customer data. Sample data uses made-up names and addresses.
- Match the mockups in `docs/design/`. Yellow is reserved for the single next action on a screen. Red is only for overdue or below-threshold items and always carries a label.
- Before opening a pull request, run the type checker, the tests and a production build.

## Commands

- `npm install` to install
- `npm run dev` to run locally
- `npm run typecheck` for the type checker
- `npm test` for the tests
- `npm run build` for a production build into `dist/`
- `npm run icons` to redraw the app icons from `public/favicon.svg` and `scripts/icon-maskable.svg`

## Where things live

- `src/components/` app shell, page header (location filter and search), icons
- `src/pages/` screens
- `src/lib/` business rules and shared state, with tests next to them
- `src/fixtures/` sample data, until the database replaces it
- `src/styles/tokens.css` design tokens from spec section 10, as CSS variables
- `supabase/migrations/` database changes, as SQL files only. `supabase/seed.sql` for seed data
