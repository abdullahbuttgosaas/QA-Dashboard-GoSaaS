# Glaukos QA Performance & Solution Quality Dashboard

Internal app that tracks **QA activity** (how much QA work was done) and **solution quality**
(what QA found in the solutions under test), per reporting period and over time.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth, Storage, RLS) · Gemini · Vercel.

## How it works

- **One app, two modes.** `/<slug>` (e.g. `/abdullah`) is a public, read-only dashboard for managers.
  The owning QA user sees the same pages plus editing controls after signing in with a `@gosaas.ai` account.
- **Document-first workflow.** Upload a QA report (PDF, Word, text) → Gemini extracts structured JSON →
  the QA user reviews/edits → confirms → it is saved and the dashboard updates. Manual create/edit is also available.
- **AI output is never trusted directly.** It is stored in `qa_documents.extraction` and only copied to
  `qa_records` when a human confirms it (`confirm_extraction()` SQL function).

## Data model

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`. Public slug, visibility, role, reporting-period settings. |
| `qa_records` | One row per ticket. Relational columns for lookup/bucketing + `data` JSONB (requirements, test cases, bugs, retests, evidence, custom fields/sections). Shape: `src/types/qa.ts`. |
| `qa_documents` | Uploaded report files (Supabase Storage bucket `qa-reports`) and AI extraction/review state. |

Metrics are **derived** from the JSONB (`qa_record_metrics` view, `qa_metrics_for_range()`, `qa_metrics_by_period()`),
never entered as aggregates. Pass rate = passed ÷ (passed + failed); blocked/not-run are reported separately.

**Reporting periods** are configurable per user in Settings: period length (default 14 days) and an optional
start date. With no start date, periods are rolling windows ending today.

## Security model

Hiding buttons is not the boundary; the database is.

- `anon` (managers): `SELECT` only, only rows of public profiles, no `email`, no raw AI extraction,
  only confirmed documents. No insert/update/delete grants at all.
- `authenticated`: writes only rows they own (`owner_id = auth.uid()`) and only with a `@gosaas.ai` JWT.
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
| `npm run audit:local` | End-to-end permissions audit against the local stack + dev server (refuses non-local targets) |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local DB |
| `npm run typecheck` / `npm run lint` | Static checks |

Local magic-link emails arrive in Mailpit at http://127.0.0.1:54324.

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

Supabase dashboard → Authentication:

- **URL Configuration:** Site URL = production URL; Redirect URLs include `https://<prod-domain>/auth/callback`
  (and `https://*-<team>.vercel.app/auth/callback` for previews).
- **Hooks:** enable *Before User Created* → Postgres function `public.hook_before_user_created`.
- **SMTP:** configure a custom SMTP sender; Supabase's built-in sender is heavily rate-limited.

## Project layout

```
src/app/            routes: /[slug] dashboard, tickets, upload, review, settings; /login; /auth; /api
src/app/actions/    server actions (validated with zod, re-check session; RLS enforces again)
src/components/     UI (dashboard charts, ticket views, record editor)
src/lib/            env, Supabase clients, auth helpers, formatting
src/services/       data access, metrics, extraction (provider interface + Gemini)
src/types/          QA data schema (zod) and generated DB types
supabase/           config, migrations, seed, tests
```
