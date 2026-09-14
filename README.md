# DealAtlas

UK-first B2B opportunity intelligence. This repository contains the Next.js application, Supabase migrations, and product specifications.

## Stack
- Next.js 16 App Router
- TypeScript (strict)
- Tailwind CSS v4
- shadcn/ui
- Supabase SSR/Auth/Postgres
- Dodo Payments (`@dodopayments/nextjs`) for Pro checkout, webhooks, and the customer portal
- Vercel-compatible runtime

## Local development
```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with local Supabase values (`npx supabase start` prints the API URL and keys). Never prefix server secrets with `NEXT_PUBLIC_`.

Email/password auth is available at `/signup`, `/login`, `/forgot-password`, and `/reset-password`. Local Supabase currently auto-confirms email; hosted production should require verification. Auth emails from the local stack appear in Mailpit/Inbucket (`npx supabase status` prints the URL).

## Scripts
| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` | Vitest unit/integration tests |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run db:start` | Start local Supabase (Docker) |
| `npm run db:reset` | Recreate the **local** database from migrations |
| `npm run db:types` | Generate `lib/db/database.types.ts` from local schema |
| `npm run db:test` | Run pgTAP database tests |
| `npm run test:db` | pgTAP plus PostgREST RLS smoke tests |
| `npm run db:bundle` | Refresh `supabase/dealatlas_full_schema.sql` from migrations |

Never run `db reset` against a linked production database. Never expose `SUPABASE_SECRET_KEY` as a `NEXT_PUBLIC_` variable.

## Specification
- `SETUP_STEPS.md` — manual setup order
- `CURSOR_GOALS.md` — ordered Cursor `/goal` prompts
- `.cursor/rules/dealatlas.mdc` — always-on engineering safeguards
- `docs/PRODUCT.md` — product / free-vs-Pro behaviour
- `docs/ARCHITECTURE.md` — technical architecture
- `docs/DATABASE.md` — database model and security boundary
- `docs/DATA_INGESTION.md` — public/private source ingestion
- `docs/SECURITY.md` — anti-bypass and security rules
- `docs/BILLING_DODO.md` — Dodo subscription behaviour
- `docs/DESIGN.md` — UI design system
- `docs/TECHNICAL_SEO.md` — technical SEO
- `docs/TESTING_AND_LAUNCH.md` — test and launch gates
- `supabase/migrations/*.sql` — executable database migrations

## Core security rule
Free users receive only `deal_previews`. Buyer/company name, source, source title, URLs, references, exact identifying facts, documents and contacts remain protected until server-side Pro entitlement is verified.
