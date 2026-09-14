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

## 4. Layout
- max content width around 1200–1320px
- generous whitespace
- 8px spacing grid
- cards with subtle border and restrained shadow
- sticky search/filter controls where useful
- mobile-first responsive behaviour

## 5. Main navigation
Public:
- Logo
- Find Deals
- How It Works
- Pricing
- Sign In
- Get Started

Authenticated:
- Discover
- Saved
- Searches
- Alerts
- Buyers (Pro)
- Renewals (Pro)
- Billing/Account

## 6. Deal card — free
Show:
- DealAtlas preview title
- public/private badge
- main category
- broad region
- value band
- deadline band
- SME suitability
- bid complexity
- optional relevance score
- 1–2 sentence sanitised preview
- "View opportunity" CTA

Do not show protected source identity.

## 7. Deal detail — free
Sections:
1. Preview heading
2. Opportunity snapshot
3. Sanitised summary
4. General requirements
5. DealAtlas fit indicators
6. Locked intelligence panel
7. Upgrade CTA

Locked fields should be clearly labelled rather than blurred source text already sent to browser.

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

Benefits:
- see who is buying
- exact deadline/value
- source and application link
- documents and requirements
- buyer/competitor intelligence
- alerts for similar opportunities

CTA:
**Unlock with DealAtlas Pro**

Secondary link:
View pricing

## 10. Dashboard
Widgets:
- New matches
- Closing soon
- Saved deals changed
- New buyer activity
- Upcoming renewals

Avoid vanity metrics that do not help a supplier act.

## 11. Search UX
Desktop:
- search bar top
- left filter rail or top filter controls depending density
- results count
- sort
- result cards/table toggle only if both are genuinely useful

Mobile:
- full-width search
- filter drawer
- cards
- sticky upgrade/save action where appropriate

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

## 14. Design anti-patterns
Do not:
- make every card heavily shadowed
- use excessive gradients
- use tiny grey text
- put critical actions only on hover
- blur protected source text
- show fake live counts
- use artificial urgency

## 15. Implementation notes
Semantic tokens, Inter typography, shells, and Deal display components are implemented in the Next.js app. Reusable Deal cards use dummy fixtures/stories only. Locked fields render labelled placeholders and benefits; they do not accept protected values and must not blur source text.
