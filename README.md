# Glaukos QA Performance & Solution Quality Dashboard

Internal app tracking QA activity and the quality of solutions under test.

Stack: Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, RLS) · Gemini · Vercel.

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in values (never commit `.env.local`).
3. Link Supabase: `npx supabase login` then `npx supabase link --project-ref <ref>`
4. Apply migrations: `npm run db:push` · regenerate types: `npm run db:types`
5. `npm run dev`

## Layout

- `src/app` — routes (public `/[slug]` dashboard, authenticated workspace)
- `src/components` — UI
- `src/lib` — Supabase clients, env, auth helpers
- `src/services` — business logic (metrics, extraction, QA records)
- `src/types` — shared types, generated DB types
- `supabase/migrations` — all schema changes (source of truth)
