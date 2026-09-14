# DealAtlas Build Pack

This pack is the implementation specification for the UK-first DealAtlas opportunity intelligence SaaS.

## Files
- `SETUP_STEPS.md` — manual setup order from blank repository to production readiness.
- `CURSOR_GOALS.md` — ordered copy/paste Cursor `/goal` prompts.
- `.env.example` — environment variable template.
- `.cursor/rules/dealatlas.mdc` — always-on Cursor project safeguards.
- `docs/PRODUCT.md` — product/free-vs-Pro behavior.
- `docs/ARCHITECTURE.md` — technical architecture.
- `docs/DATABASE.md` — database model/security boundary.
- `docs/DATA_INGESTION.md` — public/private source ingestion.
- `docs/SECURITY.md` — anti-bypass/security rules.
- `docs/BILLING_DODO.md` — Dodo MoR subscription behavior.
- `docs/DESIGN.md` — UI design system.
- `docs/TECHNICAL_SEO.md` — technical SEO only; acquisition funnel deliberately deferred.
- `docs/TESTING_AND_LAUNCH.md` — test and launch gates.
- `supabase/migrations/*.sql` — executable database creation migrations.

## Database run order
1. 0001_extensions_and_types.sql
2. 0002_core_schema.sql
3. 0003_user_billing_schema.sql
4. 0004_security_and_rls.sql
5. 0005_functions_and_indexes.sql
6. 0006_seed_reference_data.sql

Use `npx supabase db push` after linking the project, or run the SQL files in Supabase SQL Editor in numeric order.

## Core security rule
Free users receive only `deal_previews`. Buyer/company name, source, source title, URLs, references, exact identifying facts, documents and contacts remain protected until server-side Pro entitlement is verified.

## Marketing stop point
This pack intentionally does not build the later Google Ads + UK SEO sales funnel. Complete the product first, then start that phase only when explicitly requested.
