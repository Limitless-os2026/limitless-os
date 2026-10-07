# Limitless OS build spec

Version 1, October 7, 2026. Owner: Thomas Adams, We Are Limitless LLC (Limitless Roofing & Restoration).

This file is the source of truth for building Limitless OS, the company's internal CRM and field operations app. It was written from the owner's brief, his answers to design questions, and recordings of the tools he uses today. Where this file and a guess disagree, this file wins. Where this file is silent on a business rule, ask in the pull request instead of guessing.

> Transcribed from the original `limitless-os-spec.pdf` in the first task. The mockups that were in Appendix A now live as separate files in [`docs/design/`](design/), and the appendix has been removed from this file.

## 1. The business in one page

- Roofing, insurance restoration, exterior work and emergency services: tarps, board-ups, tree impact, stabilization.
- Two offices: Reading, Pennsylvania (headquarters) and American Fork, Utah (opening October 2026). More states will follow, so everything is multi-location from the start.
- Work runs at two speeds. Emergency jobs open and close in hours. Insurance and retail jobs run for weeks or months through estimating, supplements, production and collection.
- A major lead channel is SERVPRO. Ownership groups own franchises, franchises have contacts, and contacts refer jobs. Every job keeps the group, franchise and contact that sent it, so revenue and profit can be reported per partner.
- The current CRM is JobNimbus. Limitless OS runs alongside it at first and takes over one workflow at a time. Emergency services moves first.
- CompanyCam is not used. Do not integrate it.

## 2. Product principles

1. Mobile first. Field users are on phones, on roofs and at emergency scenes. Touch targets are at least 44px.
2. One next step. Each screen shows one primary action. Everything else is quiet.
3. Management by exception. The home screen lists what needs attention. Nobody should scan 200 healthy jobs to find the five with a problem.
4. The software infers what it can: timestamps, stage dates, job numbers, statuses.
5. One source of truth. Nothing is typed twice.
6. Few fields. Creating a customer needs a name and a phone number.
7. Plain words. No database terms in the interface. Sentence case. No all-caps labels.
8. Nothing is deleted. Records are archived and their history is kept.

## 3. Stack (decided)

| Piece | Choice | Notes |
| --- | --- | --- |
| Database, login, files, live updates | Supabase (Postgres) | Row level security on every table. Free plan while building, Pro before real data goes in |
| App | React, TypeScript, Vite, single-page app | Installable to the home screen. Keep it a pure client-side app so it can be wrapped as a native iPhone app later |
| Hosting | Cloudflare, static files | Deploys from GitHub. Every route falls back to `index.html` |
| Code | GitHub, this repository | The owner owns the code and the data |
| Built with | Claude Code cloud sessions | The owner works from an iPad and is not a developer |

Conventions:

- Database changes go only through SQL migration files in `supabase/migrations/`. Never by hand in a dashboard.
- Seed data lives in `supabase/seed.sql`.
- No secrets in the repository. The app reads the Supabase URL and public key from environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`).
- TypeScript in strict mode. Generate database types from the schema.
- React Router for routing. TanStack Query for server data. No UI kit: styles follow the design tokens in section 10 as CSS variables.
- Fonts are bundled with the app, not loaded from a CDN, so the installed app works with no signal.
- Build command `npm run build`, output folder `dist`.
- Tests cover business rules: job numbers, permissions, stage moves, and later commission math.

## 4. Working rules for Claude Code

Copy this section into `CLAUDE.md`.

- The owner is the product owner, not a developer. Write pull request descriptions in plain business language: what changed, how to check it by tapping through the app, and anything you were unsure about.
- One feature per pull request. Keep them small.
- Stay inside the current phase and step. Do not build ahead.
- If a business rule is unclear or missing, do not guess. Build the rest and list the question in the pull request.
- Every table gets row level security, the standard columns, and an audit trigger where section 7 says so.
- Never commit secrets or real customer data. Sample data uses made-up names and addresses.
- Match the mockups in `docs/design/`. Yellow is reserved for the single next action on a screen. Red is only for overdue or below-threshold items and always carries a label.
- Before opening a pull request, run the type checker, the tests and a production build.

## 5. Phases

| Phase | Scope |
| --- | --- |
| 1. Core | Login, offices, roles and permissions, customers, properties, organizations, contacts, jobs, boards, job record, tasks, appointments, timeline, audit log, basic home screen |
| 2. Operations | Emergency dispatch and the technician flow first: dispatches, field stages, photos, signatures, an offline queue. Then documents |
| 3. Money | Claims, supplements, estimates, invoices, payments, job costs, margin, commissions and emergency labor pay |
| 4. Automation | Needs Attention rules, automated tasks, notifications. Dispatch alerts go out as a push and a text |
| 5. Integrations | QuickBooks, email, SMS, Microsoft 365, mapping, JobNimbus import |
| 6. Management | Partner dashboards, forecasting, location comparisons |

### Phase 1 build order

1. Repository setup, app shell, Office home with sample data, installable app. This is the first task.
2. Supabase schema for company structure, roles, permissions and login, with seed data.
3. Customers, properties, organizations and contacts: create, edit, search, and a duplicate warning by phone number.
4. Jobs: quick create, automatic job numbers, boards built from the real pipelines and stages, moving a job between stages, the slide-over preview, the job record.
5. Tasks, appointments, timeline and notes, audit log.
6. Home screen: Needs Attention from simple rules (days in stage), Today, board counts.

### The first task, in detail

- Move this file to `docs/spec.md`. Split the mockups in Appendix A into separate files under `docs/design/` and remove the appendix from the spec.
- Create `CLAUDE.md` from section 4, pointing to `docs/spec.md`.
- Scaffold the app from section 3 at the repository root.
- Build the app shell from the mockups: the green sidebar with the two create buttons and the eight navigation links, the location filter, and the search box. On a phone, collapse the sidebar into a top bar with a menu button and keep New emergency reachable. The phone layout for office screens has no mockup yet, so say what you chose in the pull request.
- Build the Office home screen from `docs/design/office-home.html` with sample data kept in one fixture file.
- Other navigation links lead to a simple page that says the screen arrives in a later step.
- Make the app installable: a web app manifest named Limitless OS, icons, and a service worker that caches the app shell.
- Add a README in plain language: what this is, how to run it, how to deploy it to Cloudflare.

## 6. Decisions locked in

- A lead and a job are one record. Lead is the first stage of a job, so nothing is retyped when it sells.
- A tarp that becomes a roof replacement is a second job linked to the first through `parent_job_id`. It inherits the customer, property, claim and referral.
- A claim is its own record tied to the property (Phase 3). Several jobs can share one claim.
- Every job belongs to exactly one office. Offices roll up to states. People can belong to more than one office.
- Job numbers are issued the moment a job is created, lost leads included. Format: state code, two-digit year, five-digit sequence, such as `PA-2600123`. The sequence runs per state per year, is never reused, and is issued in the same transaction that creates the job.
- A job can have more than one salesperson. Each holds a share, and the shares total 100.
- Lead credit has three values: `self_generated`, `office_generated` and `servpro`.
- Job type is the kind of work, such as metal roof or gutters. The board is chosen separately, and a type may set a default board.
- All Production and All Billing are views across boards, not boards of their own.

## 7. Database design, Phase 1

### Ground rules

- Tables are plural, lowercase, with underscores. Columns follow the same style.
- Every table has `id uuid` (generated), `created_at timestamptz`, `updated_at timestamptz` and `created_by uuid` pointing to `profiles`. The database fills them in. They are not repeated in the lists below.
- Main records carry `archived_at timestamptz`. Archiving hides a record. Nothing is hard-deleted.
- Money is `numeric(12,2)`. Percentages are `numeric(5,2)`, so 37.50 means 37.5%.
- Times are `timestamptz`, stored in UTC and shown in the office's time zone.
- Pick-lists are tables with editable rows, not hard-coded lists.
- Customers, properties, organizations, contacts and jobs carry `external_source text` and `external_id text` for the JobNimbus import.
- A column ending in `_id` is a foreign key to the table it names.

### Company structure (8 tables)

**states**: `code text unique` (PA, UT), `name text`, `is_active boolean`.

**offices**: `state_id`, `name text`, `time_zone text`, `phone text`, `address_line1 text`, `city text`, `zip text`, `is_active boolean`.
Seed rows: Reading, Pennsylvania (`America/New_York`) and American Fork, Utah (`America/Denver`).

**teams**: `office_id`, `name text`, `team_type text` (sales, production, ems_crew, office), `is_active boolean`.

**roles**: `key text unique`, `name text`, `scope text` (company, state, office, own).
Seed rows: admin (company), project_manager (office), sales (own), accountant (company). A field_tech role (own) is added in Phase 2.

**role_permissions**: `role_id`, `permission_key text`. One row for each thing a role may do, such as view_margins, edit_sales_credits, reassign_jobs, view_commissions, manage_users, view_partner_reports, manage_permissions.

**profiles**: one row per person who logs in. `id` equals the Supabase auth user id. `first_name text`, `last_name text`, `email text unique`, `phone text`, `role_id`, `primary_office_id` (offices), `is_active boolean`.

**profile_offices**: `profile_id`, `office_id`. One row per person per office. Unique on the pair.

**team_members**: `team_id`, `profile_id`, `is_lead boolean`.

### People and places (4 tables)

**customers**: `customer_type text` (person, company), `first_name text`, `last_name text`, `company_name text`, `phone text`, `phone_digits text` (digits only, generated, used for search and duplicate warnings), `phone_alt text`, `email text`, `preferred_contact text` (call, text, email), `billing_address_line1 text`, `billing_address_line2 text`, `billing_city text`, `billing_state text`, `billing_zip text`, `office_id` (the office that created the customer), `notes text`, `external_source`, `external_id`, `archived_at`.
Required: a name (first name or company name) and a phone number. Nothing else.

**properties**: `customer_id`, `address_line1 text`, `address_line2 text`, `city text`, `state text` (two letters), `zip text`, `county text`, `latitude numeric(9,6)`, `longitude numeric(9,6)`, `property_type text` (residential, commercial, multi_family), `notes text`, `external_source`, `external_id`, `archived_at`.
One customer can have many properties.

**organizations**: `name text`, `org_type text` (servpro_group, servpro_franchise, restoration_company, insurance_carrier, mortgage_company, property_manager, supplier, subcontractor, vendor, other), `parent_organization_id` (organizations; a franchise points to its ownership group), `is_referral_partner boolean`, `relationship_owner_id` (profiles), `phone text`, `email text`, `address_line1 text`, `city text`, `state text`, `zip text`, `notes text`, `external_source`, `external_id`, `archived_at`.

**contacts**: professional contacts, kept separate from customers. `organization_id` (optional), `first_name text`, `last_name text`, `title text`, `contact_role text` (owner, general_manager, mitigation_manager, project_manager, dispatcher, estimator, office_manager, adjuster, agent, other), `phone text`, `mobile text`, `email text`, `notes text`, `external_source`, `external_id`, `archived_at`.

### Work (10 tables)

**pipelines**: `key text unique`, `name text`. One per board.
Seed rows: retail, insurance, emergency_tarps, servpro_recon, warranty_claims.

**pipeline_stages**: `pipeline_id`, `key text`, `name text`, `sort_order integer`, `category text` (lead, estimating, sold, in_production, accounts_receivable, completed, lost). The category is the board section the stage sits under, and it lets reports and views work across boards.

Seed rows, copied from the owner's JobNimbus boards. Keep the names and order exactly.

| Pipeline | Section | Stages in order |
| --- | --- | --- |
| Retail | Lead | New lead, Initial appointment set |
| Retail | Estimating | Estimating, Pending approval |
| Retail | Sold | Approved |
| Retail | In production | Job scheduled, In production |
| Retail | Accounts receivable | Job completed / pending invoicing, Pending payment, Paid / pending close out |
| Retail | Completed | Job closed |
| Retail | Lost | Lost |
| Insurance | Lead | New lead, Inspection scheduled, Claim filed |
| Insurance | Estimating | Pending insurance approval, Insurance approved |
| Insurance | Sold | Customer signed |
| Insurance | In production | Job scheduled, In production, Job completed |
| Insurance | Accounts receivable | Supplementing, Invoiced / pending payments, Paid / pending close out |
| Insurance | Completed | Job closed |
| Insurance | Lost | Lost |
| Emergency tarps | Lead | Inbound job |
| Emergency tarps | Sold | Tarp scheduled |
| Emergency tarps | In production | Pending invoicing |
| Emergency tarps | Accounts receivable | Pending payments |
| Emergency tarps | Completed | Paid and closed |
| SERVPRO recon | Lead | New lead, Inspection scheduled |
| SERVPRO recon | Estimating | Estimating, Pending approval |
| SERVPRO recon | Sold | Approved |
| SERVPRO recon | In production | Job scheduled, Jobs completed / pending invoicing |
| SERVPRO recon | Accounts receivable | Pending payments, Paid / pending close out |
| SERVPRO recon | Completed | Job closed |
| SERVPRO recon | Lost | Lost |
| Warranty claims | Lead | Assigned |
| Warranty claims | In production | In progress |
| Warranty claims | Completed | Closed |

Phase 2 adds the field stages from the owner's brief to Emergency tarps: Dispatched, En route, On site, Work in progress.

**job_types**: `key text`, `name text`, `default_pipeline_id` (pipelines, optional), `is_emergency boolean`, `sort_order integer`, `is_active boolean`.
Seed rows: Asphalt roof, Metal roof, Steel shingles, EPDM roof, Rolled roofing, Garage roof, Siding, Siding and soffit, Gutters, Fascia, Heat tape, Roof tarp, Board-up, Tree damage, Inspection, Other. Roof tarp and Board-up are emergency types and default to the Emergency tarps board.

**lead_sources**: `key text`, `name text`, `default_origin text` (self_generated, office_generated, servpro), `is_active boolean`.
Seed rows: SERVPRO (servpro), Canvassing (self_generated), Billboards (office_generated), Facebook (office_generated), Google (office_generated), Self gen, other (self_generated), Office, other (office_generated). The SERVPRO default is confirmed. The others are proposed and may change.

**jobs**: the hub record. `job_number text unique`, `office_id` (required), `customer_id` (required), `property_id` (required), `job_type_id` (required), `pipeline_id`, `stage_id` (pipeline_stages), `stage_changed_at timestamptz` (set automatically), `description text`, `lead_source_id`, `lead_origin text` (self_generated, office_generated, servpro), `referral_group_id` (organizations; the ownership group at the time of referral), `referral_organization_id` (organizations; the franchise or company that sent it), `referral_contact_id` (contacts), `parent_job_id` (jobs), `claim_id uuid` (empty until Phase 3 adds claims), `project_manager_id` (profiles), `received_at timestamptz`, `sold_at timestamptz`, `completed_at timestamptz`, `closed_at timestamptz` (the last three are set automatically from stage moves), `lost_reason text`, `external_source`, `external_id`, `archived_at`.
Salespeople are not a column on the job. See the next table.

**job_sales_credits**: `job_id`, `profile_id`, `split_percent numeric(5,2)`, `is_primary boolean`. One row per rep per job. A solo sale is one row at 100. Unique on the pair. The database rejects a job whose shares do not total 100. Shares are set per job, by workload.

**job_contacts**: `job_id`, `contact_id`, `role_on_job text` (adjuster, mitigation_manager, property_manager, agent, other).

**job_stage_history**: `job_id`, `from_stage_id`, `to_stage_id`, `changed_by` (profiles), `changed_at timestamptz`. Written by a trigger on every stage move. Cycle times and response times come from here.

**job_number_counters**: `state_id`, `year integer`, `last_number integer`. Unique on state and year.

**appointments**: `job_id`, `appointment_type text` (inspection, adjuster_meeting, sales, other), `starts_at timestamptz`, `ends_at timestamptz`, `assigned_to` (profiles), `status text` (scheduled, completed, cancelled, no_show), `outcome text`.

### Tasks, timeline and audit trail (3 tables)

**tasks**: `title text`, `notes text`, `task_type text` (call, follow_up, estimate, document, schedule, other), `status text` (open, in_progress, done, cancelled), `priority text` (low, normal, high, urgent), `due_at timestamptz`, `assigned_to` (profiles), `job_id`, `customer_id`, `contact_id`, `organization_id` (all optional; at least one is filled), `office_id`, `completed_at timestamptz`, `completed_by` (profiles), `source text` (manual, automation).

**activities**: the timeline. Notes live here. `activity_type text` (note, call, email, text, stage_change, task, appointment, photo, document, payment, system), `body text`, `details jsonb`, `job_id`, `customer_id`, `contact_id`, `organization_id` (optional), `is_internal boolean`, `is_pinned boolean`, `occurred_at timestamptz`.

**audit_log**: `table_name text`, `record_id uuid`, `action text` (insert, update, delete), `changes jsonb` (previous and new value per changed field), `changed_by` (profiles), `changed_at timestamptz`. Written by triggers. No role can edit it. Phase 1 audits jobs, job_sales_credits, customers and profiles.

### Reserved for later phases

Do not build these yet. Leave room for them.

- Phase 2: `dispatches` (one row per crew dispatch with six timestamps: dispatched, accepted, en route, arrived, work started, completed), `files` (photos and documents with category, taken-at time, who, GPS, storage path), `signatures`.
- Phase 3: `claims`, `supplements`, `estimates`, `invoices`, `payments`, `job_costs`, `commission_rules`, `commission_entries`, `commission_payments`.
- Phase 4: `automation_rules`, `notifications`. The Needs Attention list is a set of saved queries, not a table.

## 8. Permissions

Visibility is enforced in the database with row level security, so it holds on every screen, export and integration.

| Role | Scope | Sees and does |
| --- | --- | --- |
| Admin | company | Everything, including settings and permissions |
| Project manager | office | Everything in their offices, money included. Cannot change permissions |
| Sales | own | Jobs where they hold a sales credit, plus their own tasks, appointments and commission |
| Accountant | company | The financials of every job: invoices, payments, costs and commissions |
| Field technician, from Phase 2 | own | Jobs they are dispatched to |

- A role is a scope (how far it sees) plus a list of permissions (what it can do). Both are data, editable by an Admin.
- A customer or property is visible to anyone who can see one of its jobs, and to Project managers in the customer's office.
- Organizations and contacts are visible to all staff. Anyone can add a contact. Changing an organization's structure is limited to Project managers and Admins.
- Partner revenue and profit reports are a separate permission, off for Sales.
- A state scope exists for a future regional manager. It covers every office in the states that person belongs to.

## 9. Commission and pay rules (Phase 3)

Recorded now so the Phase 1 schema leaves room. Do not build these yet.

- Base commission follows sold margin: 40% and up pays up to 10%. 35% to 39.99% pays 8%. 30% to 34.99% pays 6%. Under 30% pays nothing. There is no manager override below the required margin.
- Lead credit caps the rate: self gen 10%, office 8%, SERVPRO 6%.
- When two reps share a sale, their shares divide the job's base commission.
- A rep who also project-manages their own sold job earns an extra 2% of the final contract. It goes whole to that rep. Keep the rate configurable.
- Supplements pay a separate commission, about 7% of the supplement value. Keep the rate configurable.
- Emergency tarp and board-up jobs pay no sales commission. Each pays a labor amount that an Admin sets after the job is complete.
- Commission is paid in two parts. The first becomes payable when the deposit or ACV payment arrives, based on the amount received. The final is paid when the job is paid in full, and always equals total earned minus what was already paid. Never recalculate a payment without counting earlier payments.
- Statuses are Pending, Eligible, Paid and Hold. The system calculates them. People do not set them by hand.

## 10. Design

The owner approved five mockups. They were in Appendix A and now live in [`docs/design/`](design/). Borrow how JobNimbus boards and Jobber's simple flows work, never how they look.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| Brand green | `#2A5120` | Links, active states, done steps. Taken from the company logo |
| Sidebar green | `#183313` | Sidebar and phone top bar |
| Ground | `#F2F4EF` | Page background |
| Surface | `#FFFFFF` | Cards, lists, panels |
| Line | `#D9DED4` | Borders. `#E6EAE2` between rows, `#C9D1C3` on controls |
| Ink | `#1B241A` | Text |
| Muted ink | `#566153` | Secondary text. `#4A5547` on tinted backgrounds |
| Next-step yellow | `#F5C400` | The single next action on a screen, with ink text |
| Alert red | `#B42318` | Overdue and below-threshold only, with white text and a label. Soft version: `#FBE9E7` with `#8C1C13` text |
| Emergency blue | `#1F5FA8` | Live emergency markers |

- Type: Barlow (400, 500, 600) for text, Barlow Semi Condensed 600 for headings, job numbers and large counts.
- Corners 6px on controls and cards, 8px on large panels. Borders 1px. No gradients. One shadow only, on the slide-over.
- Board colors appear as small dots beside the board name: Retail `#2F6FB7`, Insurance `#D07A1F`, Emergency tarps `#B42318`, SERVPRO recon `#7A4B2A`, Warranty claims `#6B7068`.

### Navigation

- Sidebar: New emergency (yellow), New job or lead, then Home, Boards, Schedule, Dispatch, Customers, Partners, Tasks, Reports.
- A location filter on office screens: All locations, Pennsylvania, Utah.
- One search box: name, address, phone, email, job number, claim number.

### Screens

| File | Screen | What matters |
| --- | --- | --- |
| [`office-home.html`](design/office-home.html) | Office home | Needs Attention first, each row with a count and an age. Then today's schedule. Then the boards with job counts, plus the In production and Billing views |
| [`pipeline-board.html`](design/pipeline-board.html) | Pipeline board | Board switcher. Columns grouped under their section. Cards show the address, one line of context, labeled money, rep initials and a days-in-stage chip that turns red when late. Tapping a card opens a slide-over with one next step |
| [`job-record.html`](design/job-record.html) | Job record | Job number, address, one yellow next step. A stage rail. Six tabs: Overview, Timeline, Photos and files, Claim, Money, Tasks. Margin shown on the job. Sales split, referral chain, and a link to the job it came from |
| [`new-emergency-phone.html`](design/new-emergency-phone.html) | New emergency, phone | Six fields and one button. The job number and time received fill in on their own |
| [`technician-job-phone.html`](design/technician-job-phone.html) | Technician job, phone | One job, one large next-step button, call and navigate, progress steps with times, and a notice when photos are waiting for signal |

Money and margin on cards and on the job record come from Phase 3 data. Until then, leave those areas out instead of showing zeros.

## 11. Open questions

Carry these in pull requests when they become relevant. Do not resolve them by guessing.

- Commission: does a job pay the lower of its margin tier and its credit cap? Assumed yes.
- Does the 6% SERVPRO cap apply to every non-emergency job credited to SERVPRO, on any board? Assumed yes.
- Which margin sets the tier: margin before commission? Assumed yes.
- What happens when a rep has already been paid more than the final earned amount?
- Project managers: everything in their own offices (assumed), or every office?
- Default lead credit for Canvassing, Billboards, Facebook and Google, as proposed in section 7.
- How many days in each stage count as late. Until the owner sets them, use 14 days and say so.
