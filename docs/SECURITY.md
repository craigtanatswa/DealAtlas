# DealAtlas — Security & Anti-Leak Specification

## 1. Highest-priority risk
The primary product-security risk is source leakage to a non-subscriber. Treat buyer/source identity as protected commercial data even when the underlying source is publicly available elsewhere.

## 2. Trust boundaries
### Untrusted
- browser
- query parameters
- cookies supplied by client
- client-side subscription state
- client-side role labels
- webhook requests before signature verification
- scraped source payloads

### Trusted only after verification
- Supabase SSR authenticated session
- Dodo webhook after signature verification
- server-only environment variables
- service/secret database credentials on controlled server/worker

## 3. Database access rules
- Revoke direct client access to canonical source-bearing tables.
- Enable RLS on exposed user-owned tables.
- Explicitly grant only required operations.
- Never assume RLS alone removes broad table grants.
- Index user_id columns used in policies.
- Service/secret keys remain server-only.

## 4. Free preview isolation
`deal_previews` is a physical sanitised dataset, not a view that selects all sensitive columns and hopes the API omits them.

Free endpoints must query the preview dataset only.

Do not use `select('*')` on canonical Deal tables in any public route.

## 5. Protected Deal endpoint
For `/api/deals/[id]` or equivalent:
1. validate ID;
2. obtain server session;
3. require user;
4. check subscription entitlement from server-side source of truth;
5. reject FREE before protected query;
6. query protected data with server credential;
7. map to an explicit paid DTO;
8. return only required data.

## 6. Billing entitlement
Dodo checkout redirect is not proof of payment.

Only verified webhook state (or a secure provider API reconciliation) grants entitlement.

Never grant Pro because `?success=true` exists in URL.

## 7. Webhook security
- use official Dodo webhook adapter/signature verification;
- read secrets only from environment;
- keep webhook idempotent;
- store event audit row;
- avoid logging sensitive payment payloads unnecessarily;
- process duplicate events safely;
- handle out-of-order lifecycle events using provider timestamp/current provider state when needed.

## 8. Admin
Admin role is stored in server-controlled database state.

Admin routes and mutations require server-side `role=ADMIN` verification. Hiding `/admin` navigation is not authorization.

## 9. Rate limiting
Rate-limit:
- login/reset endpoints as supported
- public search
- preview detail scraping attempts
- protected Deal endpoint
- CSV export
- checkout session creation
- alert-management abuse paths

Use an IP/user-based abstraction so implementation can start simple and migrate to a dedicated rate-limit store later.

## 10. Enumeration protection
Deal UUIDs may be non-sequential, but UUID unpredictability is not the security boundary.

A free user who guesses a Deal ID must still fail entitlement checks.

Public preview slugs must resolve to preview data only.

## 11. Search leakage
Free search must not index:
- source title
- source description
- buyer name
- buyer aliases
- source URL
- procurement ID

Search result snippets must derive from preview fields only.

## 12. SEO leakage
Free/public metadata must use preview fields only.

Never include protected fields in:
- `<title>`
- meta description
- JSON-LD
- canonical query strings
- OpenGraph/Twitter metadata
- sitemap alternate text
- static generation payloads

## 13. Analytics leakage
Do not send buyer/source identity to analytics for free pages unless strictly necessary and contractually acceptable. Prefer internal Deal UUID or preview slug.

Do not put source URL in analytics event properties for anonymous/free flows.

## 14. Logs
Never log:
- Supabase secret/service keys
- Dodo API/webhook keys
- password/reset tokens
- full webhook authorization headers
- payment method data

Be cautious logging protected buyer/source details in third-party observability.

## 15. Input validation
Use Zod or equivalent for:
- query parameters
- saved-search filter JSON
- company profile
- checkout requests
- webhook-derived application mapping
- admin edits
- ingestion adapter output

## 16. XSS/source content
Scraped HTML/text is untrusted.
- strip scripts/styles
- do not render raw HTML by default
- sanitize any necessary rich text with an allowlist
- escape source content

## 17. SSRF
Source fetchers must prevent arbitrary user-controlled URLs from being fetched by trusted servers.

Only fetch URLs produced by configured source adapters and permitted document hosts, with redirect/host validation.

## 18. CSV export security
- Pro entitlement required
- enforce row/month limit server-side
- escape formula-leading cells (`=`, `+`, `-`, `@`) to mitigate spreadsheet injection
- export only fields user is entitled to
- log usage count

## 19. File/document safety
If DealAtlas downloads source documents:
- enforce max size
- allowed MIME types
- avoid executing macros/scripts
- scan before storage/processing where practical
- do not expose internal storage bucket publicly unless intended

## 20. Secrets
Required secrets remain outside Git:
- SUPABASE secret/service key
- database password/direct URL
- DODO API key
- DODO webhook key
- email provider key
- monitoring auth tokens

Commit `.env.example`, never `.env.local` or production values.

## 21. Security tests before launch
- direct anon REST query to protected tables fails
- direct authenticated free REST query to protected tables fails
- free user manually calls paid API and receives 403
- free user changes client plan variable and still receives 403
- expired/on-hold user loses protected access per entitlement policy
- paid user can access expected data
- duplicate Dodo webhook does not duplicate transitions
- forged webhook fails
- admin endpoint rejects Pro user
- preview leak scanner catches buyer/source strings
- CSV formula injection test passes
