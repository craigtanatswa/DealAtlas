# DealAtlas — Design System

## 1. Design objective
DealAtlas should look like a serious B2B intelligence product, not a government portal and not a flashy consumer marketplace.

Keywords:
- credible
- analytical
- clean
- opportunity-focused
- fast to scan
- premium but restrained

## 2. Visual direction
Suggested palette:
- Deep Navy: #0B1F33 — primary surfaces/text
- Atlas Blue: #2563EB — primary action
- Teal: #0F9F8F — positive intelligence/accent
- Amber: #D99000 — deadlines/warnings
- Red: #C73A3A — urgent/error
- Slate 50/100/200/500/700/900 — neutral system
- White: #FFFFFF

Use semantic tokens rather than hard-coded colours throughout components.

## 3. Typography
Use a modern system/web font with strong legibility. Prefer Inter or a similar sans-serif already supported in the Next.js stack.

Hierarchy:
- H1 36–48px desktop, 30–36px mobile
- H2 28–32px
- H3 20–24px
- body 15–16px
- dense metadata 13–14px
- headings use `text-wrap: balance`; supporting copy uses `text-pretty`
- dynamic counts (quotas, match scores, unread totals) use tabular numerals

## 4. Layout
- max content width around 1200–1320px
- generous whitespace
- 8px spacing grid
- listing cards with a 1px border, no heavy shadow
- sticky search/filter controls where useful
- mobile-first responsive behaviour
- homepage hero on a light surface, database content on white

## 5. Main navigation
Public:
- Logo
- Find Deals
- How It Works
- Pricing
- Sign In
- Get Started

The public bar is four zones: wordmark on the left, a compact keyword search that submits to `/deals`, text links centred in the remaining bar, then Sign In and a pill Get Started on the right. Links are text, not packed chips. Keep every working destination.

The workspace bar uses the same search control against `/app/search`. Both header searches are GET forms with `q` only; they do not add a second search architecture.

Authenticated:
- Discover
- Saved
- Searches
- Alerts
- Buyers (Pro)
- Suppliers (Pro)
- Contracts (Pro)
- Renewals (Pro)
- Billing/Account

Keep every working destination. Cleaner chrome is not a reason to drop navigation.

## 6. Deal card — free
Listing-style cards, scannable like a professional B2B directory:

- DealAtlas preview title
- sanitised summary with enough commercial detail to judge fit
- status
- public/private buyer
- category
- opportunity type
- broad region
- value band
- deadline band
- SME suitability
- optional tags and relevance score
- "View opportunity" CTA

Use typography and spacing for hierarchy. Use badges only where they help scanning (status). Do not show protected source identity.

## 7. Deal detail — free
Sections:
1. Preview heading
2. Summary
3. Products and services required
4. Opportunity details (category, location band, value, deadline, term, stage)
5. Eligibility and fit
6. Locked source fields
7. Upgrade CTA

Free users should already understand the commercial value before the subscription CTA. Locked fields are labelled placeholders. Do not blur source text.

## 8. Deal detail — Pro
Sections:
1. Exact title + buyer
2. status/deadline/value actions
3. source/application CTA
4. executive summary
5. key requirements
6. lots
7. award criteria
8. documents
9. buyer intelligence
10. previous/related contracts
11. incumbent/competitor signals
12. timeline/change history
13. renewal signals
14. save/export/share-link-as-permitted actions

## 9. Paywall component
Headline example:
**Unlock the buyer and pursue this opportunity**

Locked fields:
- Buyer identity — Available to subscribers
- Original source — Unlock source
- Official notice — Subscription required
- Reference number — Unlock full details
- Documents and requirements
- Buyer/competitor intelligence

CTA:
**Unlock with DealAtlas Pro**

Secondary link:
View pricing

## 10. Homepage and workspace
The public homepage is marketing + search + live opportunity discovery + conversion. Visitors can search immediately and browse real `deal_previews`. Do not hide product value behind sign-up. The public hero may show decorative, non-interactive category chips around the search column; they use the existing category catalogue only, fetch nothing, and must not cover the headline, copy, or search.

Authenticated `/app` leads with search and live opportunities, then quotas and alerts.

Do not invent live opportunity counts, users, or contract values.

## 11. Search UX
Desktop:
- large search bar as the primary CTA
- category shortcuts into existing filters
- left filter rail
- active filter chips
- results count
- listing cards

Mobile:
- full-width search
- filter drawer/sheet
- listing cards
- no permanently stacked filter column

## 12. Empty/loading/error states
Every data surface needs intentional states.

Examples:
- no deals match filters
- ingestion temporarily stale
- paid data unavailable for one Deal
- payment still confirming
- export limit reached
- saved-search limit reached

## 13. Accessibility
- WCAG-aware contrast
- visible focus states
- keyboard navigation
- semantic labels
- buttons not divs
- no colour-only status communication
- meaningful screen-reader labels for locked fields
- prefer 44px touch targets; at least 40px on dense desktop controls
- nested search and filter surfaces use concentric radii (`outer = inner + padding`)

## 14. Design anti-patterns
Do not:
- make every card heavily shadowed
- use excessive gradients
- use tiny grey text
- put critical actions only on hover
- blur protected source text
- show fake live counts
- use artificial urgency
- add extra conversion popups beyond the delayed anonymous signup prompt

## 15. Implementation notes
Semantic tokens, Inter typography, shells, listing cards, and Deal display components are implemented in the Next.js app. The homepage and signed-in workspace lead with live sanitised previews from existing search helpers. Reusable Deal cards use dummy fixtures/stories only. Locked fields render labelled placeholders and benefits; they do not accept protected values and must not blur source text.

Interactive controls use interruptible color and transform transitions, `scale(0.96)` on press, and 40px-tall default fields. Icon buttons expand their hit area with a pseudo-element rather than enlarging visible chrome. Listing cards keep a 1px border without heavy shadows.

The DealAtlas wordmark is `/brand/dealatlas-logo.png`, rendered through `BrandMark` / `BrandLogo` in public, workspace, admin, and auth chrome. Do not replace header logos with text-only wordmarks.

Anonymous visitors on public pages see a dismissible signup dialog after one minute of visible time in the current browser session. It does not appear for signed-in users, auth routes, or automated browsers. Dismissal is stored in `sessionStorage` only.
