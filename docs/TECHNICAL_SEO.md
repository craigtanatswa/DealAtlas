# DealAtlas — Technical SEO Product Requirements

This document covers product/technical SEO readiness only. It intentionally does not define the later UK SEO acquisition funnel, keyword portfolio, backlink campaign or Google Ads strategy.

## 1. Indexable public pages
- homepage
- pricing
- how it works
- selected category landing pages with genuinely useful content
- published anonymised Deal preview pages only when they contain sufficient unique value

## 2. Never leak protected data through SEO
Metadata for free Deal pages must be generated exclusively from `deal_previews`.

Do not use:
- buyer name
- exact source title
- source URL
- procurement reference
- exact source description
- identifying structured data

## 3. Dynamic Deal pages
For a published preview:
- descriptive anonymised title
- anonymised meta description
- canonical URL using preview slug
- OG metadata using preview content only
- no source-identifying JSON-LD

## 4. Index quality
Do not index every thin/duplicated record automatically.

Set noindex when:
- preview is unpublished
- leak risk not LOW
- content is too thin
- deal is duplicate
- page is an internal search/filter combination

## 5. Search/filter URLs
Search/filter result pages should generally be canonical/noindex unless a deliberate curated landing page exists.

Avoid infinite combinations generating crawl traps.

## 6. Sitemaps
Separate sitemaps if scale warrants:
- static pages
- category pages
- published Deal previews

Only include canonical indexable URLs.

## 7. Robots
Allow valuable public pages. Block/correctly noindex internal application/admin/auth routes.

Do not rely on robots.txt to protect sensitive information; authentication/authorization is the security boundary.

## 8. Performance
Target strong Core Web Vitals:
- use Server Components where beneficial
- paginate
- avoid huge client bundles
- optimise fonts/images
- cache safe public preview queries

## 9. Structured data
Use only schema types that accurately represent the page. Do not invent employment/job/tender schemas or buyer identity that is withheld.

## 10. Measurement
Prepare Google Search Console and analytics integration hooks, but campaign/content strategy is a later phase.
