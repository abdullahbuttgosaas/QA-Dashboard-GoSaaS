# Glaukos QA Performance & Solution Quality Dashboard

Internal app that tracks **QA activity** (how much QA work was done) and **solution quality**
(what QA found in the solutions under test), per reporting period and over time.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth, Storage, RLS) · Gemini · Vercel.

## How it works

- **Manager experience (`/manager`, `/manager/tickets`, `/manager/tickets/[id]`)** — always read-only, no sign-in.
  A QA selector (`?qa=<slug>`, or *All QAs*) filters metrics, trends and tickets and is kept while navigating.
  These pages query Supabase with an anonymous, cookie-free client, so they look identical even when a QA user
  is signed in. Managers always see every QA and all confirmed data; QAs cannot hide their work.
- **QA experience (`/qa`, `/qa/tickets`, `/qa/tickets/[id]`, `/qa/upload`, `/qa/review/[id]`, `/qa/settings`)** —
  requires an `@gosaas.ai` email + password sign-in; shows only the signed-in QA's own data plus create/edit/delete,
  upload and AI extraction. Sign-in lands on `/qa`.
- Legacy links (`/abdullah`, `/abdullah/tickets`, `/abdullah/tickets/<ticket>`) redirect to the manager pages.
- **Document-first workflow.** Upload a QA report (PDF, Word, text) → Gemini extracts structured JSON →
  the QA user reviews/edits → confirms → it is saved and the dashboard updates. Manual create/edit is also available.
- **AI output is never trusted directly.** It is stored in `qa_documents.extraction` and only copied to
  `qa_records` when a human confirms it (`confirm_extraction()` SQL function).

## Data model

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`. Display name, slug (manager filter), role, `reporting_period_weeks`. (`is_public`, `reporting_period_days`, `reporting_period_anchor` are legacy and unused.) |
| `qa_records` | One row per ticket. Relational columns for lookup/bucketing + `data` JSONB (requirements, test cases, bugs, retests, evidence, custom fields/sections). Shape: `src/types/qa.ts`. |
| `qa_documents` | Uploaded report files (Supabase Storage bucket `qa-reports`) and AI extraction/review state. |

Metrics are **derived** from the JSONB (`qa_record_metrics` view, `qa_metrics_for_range()`, `qa_metrics_by_week()`),
never entered as aggregates. Pass rate = passed ÷ (passed + failed); blocked/not-run are reported separately.

**Reporting periods** are complete calendar weeks, **Monday–Friday** (weekends never count). A period is N weeks
ending with the current week (default 2 = previous + current week), compared with the N weeks immediately before.
Trends show one bucket per week ("Previous week" / "Current week", or "Week 1..N"). Each QA sets N (1–12) in
Settings; the manager's All-QAs view uses 2 weeks, an individual QA view uses that QA's setting. Buckets come from
`qa_metrics_by_week()`.

**Attribution:** tickets assigned count by `assigned_on`; tickets completed by `qa_completed_on`. For a ticket that
has `qa_completed_on`, *all* its ticket-level QA metrics (test cases executed/passed/failed/blocked, bugs, retests)
count in the week of `qa_completed_on`, whatever dates the individual items carry. Tickets without a completion date
keep using each item's own date.

**Lifetime:** the dashboards' *Period* filter (`?period=1..12` or `?period=lifetime`, not saved) adds Lifetime: totals
over all history (`qa_metrics_lifetime()`), weekly Monday–Friday trend buckets from the first week with data
(`qa_metrics_lifetime_weeks()`), and no previous-period comparison.

**Ticket status and QA completed date:** only *QA completed* tickets have (and require) a completion date.
Assigned / In progress tickets cannot have one — enforced by the editor, server validation and a DB constraint.

## Security model

Hiding buttons is not the boundary; the database is.

- `anon` (managers): `SELECT` only, across every QA: profiles (no `email`), tickets, confirmed documents and
  their files. Never drafts or raw AI extraction. No insert/update/delete grants at all.
- QA authentication: Supabase Auth email + password (`signUp`, `signInWithPassword`, `signOut`).
- `authenticated` (QA workspace): reads and writes only rows they own (`owner_id = auth.uid()`) and only with a `@gosaas.ai` JWT.
- Signups from other domains are rejected in the database (trigger on `auth.users`) and by the
  Supabase "Before User Created" hook, in addition to the login form check.
- Report files are private; access is via 5-minute signed URLs governed by Storage RLS.
- The app never uses the Supabase secret (service-role) key: every request runs as the visitor under RLS.
- Security tests: `supabase/tests/security.test.sql` (pgTAP).

## Local development

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env.local        # fill in values
npm run db:start                  # local Supabase (applies migrations + seed)
npm run dev
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run db:test` | Reset local DB and run pgTAP security tests |
| `npm run audit:local` | Resets the local DB, then runs the end-to-end permissions audit against the local stack + dev server (refuses non-local targets) |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local DB |
| `npm run typecheck` / `npm run lint` | Static checks |

QA users sign in with email + password (Supabase Auth). Create a local account at `/login?mode=signup`.

## Database changes

All schema changes are migrations in `supabase/migrations/` (never edit the hosted schema by hand).

```bash
npx supabase migration new <name>   # write SQL
npm run db:test                     # verify locally
npx supabase db push                # apply to the linked hosted project
```

`supabase/seed.sql` is local-only sample data and is never pushed.

## Deployment (Vercel)

Environment variables (Project → Settings → Environment Variables):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (browser-safe) |
| `GEMINI_API_KEY` | Server only |
| `GEMINI_MODEL` | Optional, default `gemini-3.6-flash` |
| `GEMINI_FALLBACK_MODEL` | Optional, default `gemini-3.5-flash-lite`; used when the primary is overloaded |
| `ALLOWED_EMAIL_DOMAIN` | `gosaas.ai` |
| `NEXT_PUBLIC_SITE_URL` | Production URL |

Supabase Authentication (hosted):

- **Users:** QA accounts are created by an admin in **Authentication → Users → Add user** (email + password).
  Only `@gosaas.ai` addresses are accepted (auth hook + database trigger).
- **Email confirmation:** off; minimum password length: 8. Sign-in and sign-up send no email.
- **Hooks:** *Before User Created* → `public.hook_before_user_created`.
- The in-app sign-up form (`/login?mode=signup`) is temporary and will be removed after validation.

## Project layout

```
src/app/            routes: /manager (read-only), /qa (workspace), /login, /auth/signout, /api, legacy /[slug] redirects
src/app/actions/    server actions (validated with zod, re-check session; RLS enforces again)
src/components/     UI (dashboard charts, ticket views, record editor)
src/lib/            env, Supabase clients, auth helpers, formatting
src/services/       data access, metrics, extraction (provider interface + Gemini)
src/types/          QA data schema (zod) and generated DB types
supabase/           config, migrations, seed, tests
```
