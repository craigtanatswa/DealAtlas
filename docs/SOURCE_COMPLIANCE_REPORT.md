# DealAtlas — Private / supply-chain source compliance report

Checked: **14 September 2026**.

This report records official/public UK private-company, infrastructure, prime-contractor and supply-chain opportunity sources reviewed for DealAtlas onboarding. Public visibility is not treated as permission to scrape or repackage.

Reuse statuses follow `docs/DATA_INGESTION.md`:

- **OPEN_LICENSE / PERMISSION_GRANTED / LICENSED / TERMS_REVIEWED** — may be automated when the access method is an official API/feed with licence or terms recorded, or when HTML/PDF automation is used **and** `scraping_permitted = true`.
- **UNKNOWN** — blocked from production automation until evidence exists.
- **PROHIBITED** — blocked. Do not scrape, log in, or bypass technical restrictions.

Implementation decisions are also stored on `data_sources`.

## Summary

| Source key | Reuse status | Scraping permitted | Enabled | Decision |
| --- | --- | --- | --- | --- |
| `uk-infrastructure-pipeline` | OPEN_LICENSE | false | **yes** | Official NISTA/GOV.UK pipeline of public **and privately delivered** infrastructure projects. Automate the dashboard's public JSON layout payload (not HTML scraping). |
| `nicp-govuk-2023` | OPEN_LICENSE | false | no | Official GOV.UK XLSX under OGL, but a February 2024 snapshot superseded by the live NISTA pipeline. Represented; not scheduled. |
| `national-highways-contracts-pipeline` | OPEN_LICENSE | false | no | The RIS2 PDF carries an OGL reuse notice, but no current machine-readable contracts datasheet was found. Represented; not automated. |
| `hs2-direct-contract-opportunities` | UNKNOWN | false | no | Public Excel/HTML lists exist; hs2.org.uk asserts HS2 Ltd copyright and has no site-wide OGL. |
| `hs2-indirect-contract-opportunities` | UNKNOWN | false | no | Same copyright position; live applications go through CompeteFor. |
| `network-rail-procurement-pipeline` | UNKNOWN | false | no | Pipeline is described as downloadable, but the current procurement page did not expose a stable file URL, and BravoNR is a login portal. |
| `competefor` | PROHIBITED | false | no | Terms forbid republication except under a syndication agreement. Login required for opportunities. |
| `tideway-competefor` | PROHIBITED | false | no | Tideway supply-chain portal is CompeteFor; same terms. |
| `sizewell-c-jaggaer` | UNKNOWN | false | no | Jaggaer source-to-contract portal; registration/login. |
| `hinkley-point-c-supply-chain` | UNKNOWN | false | no | Somerset Chamber / EDF registration portal; login. |
| `national-grid-suppliers` | UNKNOWN | false | no | Achilles UVDB, Coupa and Ariba; no public opportunity feed. |
| `thames-water-capital-pipeline` | UNKNOWN | false | no | Indicative pipeline webpage; no reuse licence found. |
| `balfour-beatty-supply-chain` | UNKNOWN | false | no | Prime-contractor channel; no clear public reuse licence. |
| `constructionline` | UNKNOWN | false | no | Commercial supplier-register / opportunity platform; not a public open feed. |
| `achilles-uvdb` | UNKNOWN | false | no | Paid/login qualification database used by utilities. |
| `private-source-template` | UNKNOWN | false | no | Workflow template only. Do not enable. |

Only **one** researched source met the automation bar. That is below the target of three useful private/supply-chain sources. The standard was not lowered.

---

## 1. UK Infrastructure Pipeline (NISTA)

| Field | Evidence |
| --- | --- |
| Official source URL | [GOV.UK publication](https://www.gov.uk/government/publications/uk-infrastructure-pipeline) linking to [pipeline.nista.grid.civilservice.gov.uk](https://pipeline.nista.grid.civilservice.gov.uk/) |
| Opportunity type | Infrastructure **procurement pipeline** covering public and privately delivered projects (energy, utilities, transport, water, housing, etc.), including private-finance and regulated-asset programmes |
| Access method | `JSON_API` — Plotly Dash public `GET /_dash-layout` payload used by the official dashboard. GOV.UK states that all data can be accessed and downloaded in full. Not HTML scraping. |
| Terms / licence evidence | GOV.UK terms: most GOV.UK content is Crown copyright under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Publication is from the National Infrastructure and Service Transformation Authority (14 Jul 2025). No third-party copyright exception was stated on the publication page. |
| Robots / access notes | `https://pipeline.nista.grid.civilservice.gov.uk/robots.txt` returns the Dash app HTML rather than a robots file (no `Disallow` rules published). No login, CAPTCHA or paywall on the dashboard. Allowlisted host/path only. |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** (JSON payload, `scraping_permitted = false`) |
| Date checked | 14 September 2026 |
| Implementation decision | **Enable.** Dedicated adapter `uk-infrastructure-pipeline`. Live dashboard rows use `scheme_status` (e.g. In procurement) and `procurement_stage` (Not procured / Partially procured / Procured). Canonical type defaults to `PROCUREMENT_PIPELINE`, with `PRIVATE_TENDER` / `PUBLIC_TENDER` / `SUPPLY_CHAIN_OPPORTUNITY` / `AWARD` / `FRAMEWORK` where those fields support it. |

---

## 2. National Infrastructure and Construction Pipeline 2023 (GOV.UK workbook)

| Field | Evidence |
| --- | --- |
| Official source URL | [GOV.UK NICP 2023](https://www.gov.uk/government/publications/national-infrastructure-and-construction-pipeline-2023) — XLSX at `https://assets.publishing.service.gov.uk/media/65bb870e4965c5000de8a362/National_Infrastructure_and_Construction_Pipeline_2023.xlsx` |
| Opportunity type | Infrastructure / construction pipeline and near-term planned procurements (public and private) |
| Access method | Official spreadsheet attachment (`CSV` recorded as the closest tabular enum; file is XLSX) |
| Terms / licence evidence | GOV.UK OGL v3.0. The 2023 analysis PDF also states Crown copyright / OGL reuse excluding logos. |
| Robots / access notes | Static GOV.UK / `assets.publishing.service.gov.uk` file download. No login. |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** (file download, not HTML scrape) |
| Date checked | 14 September 2026 |
| Implementation decision | **Represent, do not enable.** Useful historically, but superseded by the live NISTA pipeline. Automating both would duplicate programmes without adding a maintained interface. |

---

## 3. National Highways contracts pipeline

| Field | Evidence |
| --- | --- |
| Official source URL | [Publication scheme](https://nationalhighways.co.uk/about-us/our-responsibilities/your-information-rights/publication-scheme/) (Contracts Pipeline Datasheet); [RIS2 pipeline PDF](https://nationalhighways.co.uk/media/arqkd5zt/national-highways-activity-pipeline.pdf); [supplier guide](https://nationalhighways.co.uk/work-with-us/suppliers/becoming-a-supplier/guide-for-new-and-prospective-suppliers/) |
| Opportunity type | Highways supply-chain / contracts pipeline |
| Access method | PDF publication; eSourcing portal for live tenders (login) |
| Terms / licence evidence | The RIS2 PDF states: “You may re-use this information (not including logos) free of charge … under the terms of the Open Government Licence.” Mapping/OS data in that PDF is separately restricted. The *developer portal* transport-data licence is a different product and **prohibits screen-scraping those APIs**; it is not used here. |
| Robots / access notes | `nationalhighways.co.uk/robots.txt` allows crawling and points at a sitemap. No current XLSX/CSV datasheet URL was found from the publication scheme or supplier pages on the check date. |
| Reuse status | **OPEN_LICENSE** (for the published PDF information) |
| Automated scraping permitted? | **No** until a current official tabular file exists. Do not scrape the eSourcing portal. |
| Date checked | 14 September 2026 |
| Implementation decision | **Represent, do not enable.** Licence is clear; the live structured feed is not. |

---

## 4. HS2 Ltd direct contract opportunities

| Field | Evidence |
| --- | --- |
| Official source URL | [Direct contract opportunities](https://www.hs2.org.uk/supply-chain/direct-contract-opportunities/) (canonical `/suppliers/direct-contract-opportunities/`) |
| Opportunity type | Direct contracts / pipeline for HS2 Ltd (infrastructure) |
| Access method | Public HTML table plus downloadable Excel |
| Terms / licence evidence | Footer: “Copyright © High Speed Two (HS2) Limited 2026”. Site-wide terms URL returned 404. Map terms prohibit redistribution of map data. Learning Legacy terms (different host) limit reproduction to non-commercial use. Some HS2 documents on GOV.UK *are* OGL; that licence was **not** stated for these website tables. |
| Robots / access notes | `robots.txt` disallows `/wp-admin/` only; supplier pages are allowed. No login for the list. Applications and some packages still point to CompeteFor / contractor portals. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** Revisit if HS2 publishes the tables under OGL or grants reuse permission. |

---

## 5. HS2 Ltd indirect / tier-1 supply-chain opportunities

| Field | Evidence |
| --- | --- |
| Official source URL | [Indirect contract opportunities](https://www.hs2.org.uk/supply-chain/indirect-contract-opportunities/) |
| Opportunity type | Subcontract / supply-chain packages and tier-2 awards; JV procurement pipeline Excel |
| Access method | HTML + Excel; live applications via CompeteFor |
| Terms / licence evidence | Same hs2.org.uk copyright reservation as (4). |
| Robots / access notes | Same robots as (4). CompeteFor remains a login brokerage. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## 6. Network Rail procurement pipeline / BravoNR

| Field | Evidence |
| --- | --- |
| Official source URL | [Procurement](https://www.networkrail.co.uk/industry-and-commercial/supply-chain/procurement/); [Becoming a supplier](https://www.networkrail.co.uk/industry-and-commercial/supply-chain/becoming-a-supplier/) |
| Opportunity type | Direct procurement pipeline, frameworks, national contracts; CP7 subcontract opportunities over £50k in NW&C are directed to CompeteFor |
| Access method | BravoNR portal (registration); Find a Tender for above-threshold notices (already ingested); claimed Excel pipeline “accessed below” on the procurement page |
| Terms / licence evidence | Transparency / FOI pages are under OGL. The procurement marketing pages did not carry an equivalent OGL statement. Open data *feeds* are a separate operational product with their own terms (no official branding). |
| Robots / access notes | robots.txt does not disallow `/industry-and-commercial/`. HTML fetch of the procurement page on the check date exposed a partners-map PDF only — no stable pipeline XLSX/CSV href. BravoNR is an authenticated eTendering system. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** Do not log into BravoNR. Above-threshold notices continue via Find a Tender. |

---

## 7. CompeteFor

| Field | Evidence |
| --- | --- |
| Official source URL | [competefor.com](https://www.competefor.com/); [terms](https://www.competefor.com/terms-and-conditions/) |
| Opportunity type | Public and private supply-chain brokerage (HS2, Tideway, Network Rail CP7 flow-down, other majors) |
| Access method | Registered login; no public API. Syndication only under a separate Syndication Agreement. |
| Terms / licence evidence | Copyright: printing allowed for own viewing / private / business use **other than re-publishing for commercial purposes**. Suppliers “must not use the site as a source of material for republication via any alternative medium unless you are an Authorised Syndication Member”. Licence also forbids publishing a database containing substantial portions of the website without BiP/TfL written consent. |
| Robots / access notes | Opportunity matching is behind registration. Do not create accounts to scrape. |
| Reuse status | **PROHIBITED** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Block.** Do not ingest. |

---

## 8. Tideway supply-chain (CompeteFor)

| Field | Evidence |
| --- | --- |
| Official source URL | [CompeteFor Tideway portal](https://www.competefor.com/tideway/); Bravo `tideway.bravosolution.co.uk` for some tenders |
| Opportunity type | Infrastructure supply-chain / subcontract |
| Access method | CompeteFor login; Bravo login |
| Terms / licence evidence | CompeteFor terms above. Bravo is an authenticated eTendering system. |
| Robots / access notes | Login required. |
| Reuse status | **PROHIBITED** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Block** (same platform as CompeteFor). |

---

## 9. Sizewell C (Jaggaer)

| Field | Evidence |
| --- | --- |
| Official source URL | [Suffolk Chamber Sizewell C supply chain](https://sizewellcsupplychain.co.uk/) describing Jaggaer as the source-to-contract platform replacing Ivalua and CompeteFor |
| Opportunity type | New-nuclear supply-chain / private tender |
| Access method | Jaggaer supplier portal (registration); regional chamber portal |
| Terms / licence evidence | No public open licence for opportunity listings. Jaggaer is a commercial S2C product. |
| Robots / access notes | Login / approval-gated registration. Do not bypass. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## 10. Hinkley Point C supply chain

| Field | Evidence |
| --- | --- |
| Official source URL | [Hinkley Supply Chain](https://www.hinkleysupplychain.co.uk/); [EDF supplier page](https://www.edfenergy.com/energy/nuclear-new-build-projects/hinkley-point-c/for-suppliers-and-local-businesses) |
| Opportunity type | Nuclear new-build supply-chain matching |
| Access method | Registration / login portal (`portal.hinkleysupplychain.co.uk`) |
| Terms / licence evidence | Site has terms (`/terms-conditions/`). No open licence to republish opportunity records. |
| Robots / access notes | Login required to use the matching portal. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## 11. National Grid suppliers

| Field | Evidence |
| --- | --- |
| Official source URL | [New suppliers](https://www.nationalgrid.com/suppliers/new-suppliers); Coupa / Ariba / Achilles UVDB as described on that site |
| Opportunity type | Utility RFP/RFQ / supplier qualification |
| Access method | Achilles UVDB, Coupa Supplier Portal, Ariba for strategic sourcing |
| Terms / licence evidence | No public opportunity dataset or OGL notice. Commercial platform terms apply. |
| Robots / access notes | Login / invitation workflows. Do not bypass. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## 12. Thames Water capital delivery pipeline

| Field | Evidence |
| --- | --- |
| Official source URL | Thames Water capital-delivery pipeline pages referenced from Find a Tender pipeline notices (e.g. notice 040637-2024) |
| Opportunity type | Utility AMP7/AMP8 major-projects **procurement pipeline** |
| Access method | HTML/PDF on thameswater.co.uk; regulated tenders also appear on Find a Tender |
| Terms / licence evidence | No OGL or other reuse licence was found on the pipeline pages. Notices themselves are already licensed via Find a Tender. |
| Robots / access notes | Public marketing pages; no official machine-readable feed identified. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not scrape the website.** Utility notices remain available via the Find a Tender adapter. |

---

## 13. Balfour Beatty (prime-contractor supply chain)

| Field | Evidence |
| --- | --- |
| Official source URL | Corporate supplier / supply-chain pages (and HS2 JV channels such as BBV, which point at CompeteFor) |
| Opportunity type | Prime-contractor subcontract / supplier search |
| Access method | Supplier portals / CompeteFor microsites; not a documented public API |
| Terms / licence evidence | No open licence for listing republication was found. |
| Robots / access notes | Do not log into supplier portals or scrape CompeteFor JVs. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## 14. Constructionline

| Field | Evidence |
| --- | --- |
| Official source URL | Commercial UK supplier-register / opportunity network |
| Opportunity type | Private / supply-chain opportunities for registered suppliers |
| Access method | Subscription / login |
| Terms / licence evidence | Not a public open-data service. Full terms sit behind the product. |
| Robots / access notes | Do not bypass the paywall or login. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate** unless a licensed feed is purchased and recorded as `LICENSED`. |

---

## 15. Achilles UVDB

| Field | Evidence |
| --- | --- |
| Official source URL | Achilles Utilities Vendor Database (used by National Grid and other utilities) |
| Opportunity type | Utility supplier qualification / buyer shortlists |
| Access method | Paid membership / login |
| Terms / licence evidence | Commercial qualification scheme, not an open opportunity feed. |
| Robots / access notes | Login required. |
| Reuse status | **UNKNOWN** |
| Automated scraping permitted? | **No** |
| Date checked | 14 September 2026 |
| Implementation decision | **Do not automate.** |

---

## Devolved public tender portals

Checked: **14 October 2026**.

These are official public-sector notice portals, separate from the private-source review above. Both have a published OCDS API that returns JSON without a login or a CAPTCHA. Neither adapter scrapes HTML. Both are seeded with `scraping_permitted = false` and `enabled = false`.

| Source key | Reuse status | Scraping permitted | Enabled | Decision |
| --- | --- | --- | --- | --- |
| `public-contracts-scotland` | OPEN_LICENSE | false | no | Official OCDS Notices API under the Open Government Licence v3.0, including Quick Quote awards (`noticeType` 104). |
| `sell2wales` | OPEN_LICENSE | false | no | Official OCDS Notices API. The publication policy licences the data under the Open Government Licence. The RSS feed is a different licence and is not used. |

On this date the API hosts presented a leaf certificate without the Sectigo intermediate. Standard TLS verification failed until that intermediate was supplied for this check only. The adapters keep TLS verification on.

### Public Contracts Scotland

| Field | Evidence |
| --- | --- |
| Official machine route | [OCDS Web API](https://api.publiccontractsscotland.gov.uk/v1): `GET https://api.publiccontractsscotland.gov.uk/v1/Notices` with `dateFrom` (`mm-yyyy`), `noticeType`, and `outputType=0` for OCDS. Record route: `GET /v1/Notice?id={ocid}`. Bulk files are also listed on the [notice download page](https://www.publiccontractsscotland.gov.uk/NoticeDownload/Download.aspx). |
| Login / CAPTCHA | The API help page describes the query parameters and does not ask for an API key, account, or CAPTCHA. A September 2026 site-notice request returned HTTP 200 JSON (`license` set to the Open Government Licence URL) with no authentication challenge. |
| Terms / licence | [Terms](https://www.publiccontractsscotland.gov.uk/sitehelp/help_terms.aspx), Copyright and the Open Government License: “Most of the material featured on this Website is subject to Crown copyright protection. However, you may use content published on this Website under the Open Government Licence v3.0 except where otherwise stated.” The same section requires the attribution “Contains public sector information licensed under the Open Government Licence v3.0.” and says the permission does not cover third-party copyright, personal data, or logos. [OGL v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) permits commercial and non-commercial reuse. |
| Robots | [robots.txt](https://www.publiccontractsscotland.gov.uk/robots.txt) includes `User-agent: *` / `Disallow: /`. That rule is for the website. Ingestion uses the API host, not HTML crawling. |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** |
| Quick Quotes | The same API lists `noticeType` 104 as “Site Notice - Quick Quote Award”. A September 2026 request returned HTTP 200 OCDS JSON, `license` set to the Open Government Licence URL, and releases tagged `award`. The [purchaser guide](https://www.publiccontractsscotland.gov.uk/userguides/Quick%20Quote%20-%20Purchaser%20Guide.pdf) says: “Quick Quotes are only distributed to the selected suppliers and are not made public on the portal.” The [OCDS publication policy](https://www.publiccontractsscotland.gov.uk/NoticeDownload/Publication%20Policies-%20PCS%20OCDS%20v1.3-%20February%202022.pdf) includes “award notices published for quotations (Quick Quotes)”. Live invitations are not an official public feed. Ingestion requests type 104 only. |
| Implementation decision | **Build the adapter. Leave it disabled.** Request contract notices and Quick Quote awards. Do not scrape the buyer Quick Quote workspace. Do not download buyer documents. A shared OCID or `relatedProcesses` OCID attaches to the existing deal. |

### Sell2Wales

| Field | Evidence |
| --- | --- |
| Official machine route | [OCDS Web API](https://api.sell2wales.gov.wales/v1): `GET https://api.sell2wales.gov.wales/v1/Notices` with `dateFrom`, `noticeType`, `outputType=0`, and `locale` (`2057` English, `1106` Welsh). Record route: `GET /v1/Notice?id={ocid}`. The [publication policy](https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy) also lists bulk OCDS release and record downloads. |
| Login / CAPTCHA | The API help page does not ask for an API key, account, or CAPTCHA. The record route returned an OCDS package whose `license` is the Open Government Licence URL. On 14 October 2026 several list queries returned HTTP 500 (`Error converting data type nvarchar to float`) from the publisher. That is a server error, not an access control. The source stays disabled until an operator enables it. |
| Data licence | [Publication policy](https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy): “This means the data can be used, reused and redistributed by any interested party in line with the Open Government License.” Section 6: “The data on Sell2Wales is licensed using the Open Government License. This allows users to: copy, publish, distribute and transmit the Information; adapt the Information; exploit the Information commercially and non-commercially for example, by combining it with other Information, or by including it in your own product or application.” |
| Website terms | [Terms](https://www.sell2wales.gov.wales/helpandresources/websitepolicies/termsandconditions) clause 5.2: “You may use and re-use any material on the Website which is marked as Crown copyright … in accordance with the terms and conditions of the Open Government License provided it is reproduced accurately and not used in a misleading context.” Clause 4.3 says users agree not to “reproduce, duplicate, copy, sell, resell or exploit for any commercial purposes any portion of the Service, use of the Service or access to the Service.” The Service is defined as the functional portal (notices, documents, questions, tender submission). The OCDS publication policy is the licence for the machine-readable notice data and expressly permits commercial reuse. Ingestion uses that API, not the interactive service. |
| RSS (not used) | [RSS terms](https://www.sell2wales.gov.wales/sitehelp/help_rss_terms.aspx): “You may not directly or indirectly charge users specifically for accessing this RSS Feed Content or otherwise commercialise such content, nor attempt to re-sell the RSS Feed Content in any way.” That route is rejected. |
| Robots | [robots.txt](https://www.sell2wales.gov.wales/robots.txt) returned no `Disallow` rules on the check date. |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** |
| Implementation decision | **Build the adapter. Leave it disabled.** English locale only. Do not scrape HTML, do not use RSS, and do not download documents that require registration. A shared OCID or `relatedProcesses` OCID attaches to the existing deal. |

## Adapter framework

Private/supply-chain sources are onboarded through a **reusable** config + `createPrivateSourceAdapter` (`ingestion/sources/private`). Adding a newly approved source requires:

1. Evidence in this report and on `data_sources`.
2. A source definition (allowlisted host/path, parser, deal-type mapping).
3. Fixtures and extraction tests.
4. Registration in `ingestion/sources/registry.ts` only when automation is allowed.

HTML helpers exist for future `TERMS_REVIEWED` + `scraping_permitted = true` sources. They are not used for UNKNOWN/PROHIBITED rows.

## Central purchasing bodies — 14 October 2026

Checked: **14 October 2026**. Crown Commercial Service became the Government Commercial Agency on 1 April 2026. `crowncommercial.gov.uk` redirects to `www.gca.gov.uk`. A source whose terms or robots.txt explicitly ban scraping or commercial reuse is `PROHIBITED` and disabled, with no fetcher. Silence on reuse is `UNKNOWN`. New rows stay disabled.

| Source key | Reuse status | Scraping permitted | Enabled | Decision |
| --- | --- | --- | --- | --- |
| `gca-agreements` | OPEN_LICENSE | false | no | Official JSON feed, no query string. First page only. |
| `gca-procurement-pipeline` | OPEN_LICENSE | false | no | One official ODS download. |
| `nhs-supply-chain` | PROHIBITED | false | no | Terms ban reuse without a written licence. No fetcher. |
| `nhs-sbs` | PROHIBITED | false | no | Terms ban commercial reuse. Catalogue requires registration. No fetcher. |

### Government Commercial Agency agreements

| Field | Evidence |
| --- | --- |
| Official source URL | [Agreements](https://www.gca.gov.uk/agreements) via `GET https://www.gca.gov.uk/api/frameworks` |
| Opportunity type | Live and future commercial agreements (frameworks and dynamic markets) |
| Access method | `JSON_API`. No query string. `page`, `limit`, `status` and `search` are disallowed, so the adapter does not paginate. |
| Terms / licence evidence | [Terms](https://www.gca.gov.uk/terms-and-conditions), “Using our content”: “Most content on our website is subject to Crown copyright protection and is published under the Open Government Licence (OGL).” “You can reproduce content published on our website under the OGL as long as you follow the licence conditions.” “We make most of the content on our website available through feeds for other websites and applications to use.” Licence: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) (“You are free to: copy, publish, distribute and transmit the Information; adapt the Information; exploit the Information commercially and non-commercially”). |
| Robots / access notes | [robots.txt](https://www.gca.gov.uk/robots.txt): “Allow crawling of all content”, then `Disallow: *page=*`, `*limit=*`, `*status=*`, `*search=*`, `*keyword=*`, and `Disallow: /agreements/*/suppliers/*`. No login or CAPTCHA on the unfiltered feed. On 14 October 2026 the unfiltered feed returned `meta.total_results` 99 and `limit` 20 (`results` 20, `page` 1). |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** (`scraping_permitted = false`) |
| Date checked | 14 October 2026 |
| Implementation decision | **Adapter, disabled.** `gca-agreements` reads that one URL, at most 6 requests per minute, and records truncation instead of requesting another page. Preserve-only. An RM number already on Find a Tender or Contracts Finder is linked and does not create a second deal. |

### Government Commercial Agency procurement pipeline

| Field | Evidence |
| --- | --- |
| Official source URL | [Upcoming agreements](https://www.gca.gov.uk/agreements/upcoming) linking to `https://assets.gca.gov.uk/wp-content/uploads/Government-Commercial-Agency-Pipeline-10.08.2026.ods.xlsx.ods` |
| Opportunity type | Upcoming and in-flight commercial agreements |
| Access method | Official ODS download, recorded as `CSV` (the tabular access method). One request. The filename is pinned; a replaced file fails this source on its own. |
| Terms / licence evidence | Same OGL statement and feed invitation as the agreements feed, at [terms](https://www.gca.gov.uk/terms-and-conditions) and [OGL v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). |
| Robots / access notes | Same [robots.txt](https://www.gca.gov.uk/robots.txt). The file URL has no disallowed query. Checked 14 October 2026: HTTP 200, `application/vnd.oasis.opendocument.spreadsheet`. |
| Reuse status | **OPEN_LICENSE** |
| Automated scraping permitted? | **No** |
| Date checked | 14 October 2026 |
| Implementation decision | **Adapter, disabled.** `gca-procurement-pipeline`. A future procurement start is `UPCOMING`; a start date already past is `OPEN`. Value is stored as the spreadsheet’s inc-VAT text, not as an ex-VAT amount. Preserve-only. Same RM dedupe as the agreements feed. |

### NHS Supply Chain

| Field | Evidence |
| --- | --- |
| Official source URL | [supplychain.nhs.uk](https://www.supplychain.nhs.uk/) (Supply Chain Coordination Limited) |
| Opportunity type | NHS framework and procurement calendar listings |
| Access method | HTML pages. No official open feed. `MANUAL`. |
| Terms / licence evidence | [Terms of use](https://www.supplychain.nhs.uk/legal-information/terms-of-use/): “No licence to use any of Our intellectual property rights is given or implied”. “you must not use any part of the materials on Our Site without first obtaining a written licence to do so from us or our licensors.” Acceptable use: “make, transmit or store electronic copies of materials protected by copyright without the permission of the owner or holder of such rights”. |
| Robots / access notes | [robots.txt](https://www.supplychain.nhs.uk/robots.txt): `Disallow: /wp-json/` and `Disallow: /?rest_route=`. Supplier portal is login. |
| Reuse status | **PROHIBITED** |
| Automated scraping permitted? | **No** |
| Date checked | 14 October 2026 |
| Implementation decision | **Do not automate.** Seed row only, `enabled = false`. No fetcher and no workflow step. |

### NHS Shared Business Services

| Field | Evidence |
| --- | --- |
| Official source URL | [sbs.nhs.uk](https://www.sbs.nhs.uk/) (NHS Shared Business Services Limited) |
| Opportunity type | Framework agreements and supplier opportunities |
| Access method | The customer framework portal requires registration (`https://one.sbs.nhs.uk/FrameworkAgreements/s/registration`). Opportunities are also on Find a Tender and SAP Ariba. `MANUAL`. |
| Terms / licence evidence | [Website terms](https://www.sbs.nhs.uk/website-terms-and-conditions/) (copyright 23 March 2021): “you may under no circumstances copy, represent, modify, transmit, publish, adapt, on whatever medium or by whatever means, or exploit in any way all or part of the Site without prior written consent from the Site Publisher.” “You must not use any part of the content on our site for commercial purposes without obtaining a licence to do so from us or our licensors.” Downloads are “for informational purposes only and for personal use.” |
| Robots / access notes | [robots.txt](https://www.sbs.nhs.uk/robots.txt) disallows `/wp/wp-admin/admin-ajax.php`. The framework catalogue itself is behind registration. |
| Reuse status | **PROHIBITED** |
| Automated scraping permitted? | **No** |
| Date checked | 14 October 2026 |
| Implementation decision | **Do not automate.** Seed row only, `enabled = false`. No fetcher and no workflow step. Above-threshold notices remain on Find a Tender. NHSBSA open data is a different body and is not used here. |

## Attribution

Where OPEN_LICENSE government information is reused:

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

---

# Public procurement and grant sources — 14 October 2026

Checked: **14 October 2026**.

A source is buildable when there is a public machine route, or plain public pages that need no login or CAPTCHA, robots.txt allows the paths that would be fetched, and the terms do not explicitly forbid automated access or commercial reuse. `OPEN_LICENSE` is used only where a licence such as the Open Government Licence is documented. `scraping_permitted` stays false unless the terms explicitly allow scraping. New sources stay disabled.

| Source key | Reuse status | Scraping permitted | Enabled | Decision |
| --- | --- | --- | --- | --- |
| `etendersni` | PROHIBITED | false | no | **BLOCKED.** Seeded disabled. Cloudflare/WAF challenge and no API. No fetcher. |
| `ukri-funding-finder` | PROHIBITED | false | no | Seeded disabled. Terms forbid commercial electronic reproduction without permission. No fetcher. |
| `find-a-grant` | OPEN_LICENSE | false | no | Build the public page adapter. Keep it disabled. |
| `innovate-uk` | OPEN_LICENSE | false | no | Build the public competition-search adapter. Keep it disabled. |

## eTendersNI — BLOCKED

| Field | Evidence |
| --- | --- |
| Official source URL | [eTendersNI](https://etendersni.gov.uk/epps/home.do) |
| Machine route | None. Prior research found the portal behind a Cloudflare/WAF challenge and no API. No OCDS, RSS or CSV notice feed was found. |
| Public pages | Not fetched past the challenge. A separate check of the [opportunity list](https://etendersni.gov.uk/epps/prepareCurrentOpportunities.do?currentType=cft) found a search form that says “Please type the code shown below” and loads `/epps/genCaptcha/captcha….jpg`. `https://etendersni.gov.uk/robots.txt` returns **302** to `https://etendersni.gov.uk/epps/home.do`, the HTML homepage, not a robots file. |
| Terms | Footer: “Copyright © European Dynamics”. About page: “e-Sourcing Platform © 2022 European Dynamics - The Information Society Integrator”. No Open Government Licence on the portal. |
| Other data | Open Data NI has historical Construction & Procurement Delivery award CSVs under the UK Open Government Licence, for example the [2016/2017 supplies and services file](https://admin.opendatani.gov.uk/en_GB/dataset/contracts-awarded-by-central-procurement-directorate-in-the-2016-2017-year/resource/d5b993f2-4f6f-4e94-9f45-c77b98201438) (metadata last updated 19 July 2017). That is a past award snapshot, not a live notice feed, so it is not used as an eTendersNI adapter. |
| Decision | **BLOCKED.** Seed `reuse_status = PROHIBITED`, `enabled = false`. Do not build a fetcher. Do not attempt to get past the Cloudflare/WAF challenge, the CAPTCHA, or a login. |

## UKRI Funding Finder — excluded

| Field | Evidence |
| --- | --- |
| Official source URL | [Funding finder](https://www.ukri.org/opportunity/) |
| Machine route | Not used. The catalogue is not ingested. |
| Terms | [UKRI terms of use](https://www.ukri.org/who-we-are/terms-of-use/): “Except as permitted for academic, personal or other non-commercial purposes, users must not reprint or electronically reproduce from the UKRI website any document, graphic or image in whole or in part without the prior written permission of UKRI, or in accordance with the Copyright, Designs and Patents Act 1988.” That forbids commercial electronic reproduction without permission. |
| Decision | **Excluded.** Seed `reuse_status = PROHIBITED`, `enabled = false`. Do not build a fetcher. |

## Find a Grant — build, disabled

| Field | Evidence |
| --- | --- |
| Official source URL | [Find a grant](https://find-government-grants.service.gov.uk/) and the public list [https://find-government-grants.service.gov.uk/grants](https://find-government-grants.service.gov.uk/grants) |
| Machine route | No separate catalogue API. `https://www.gov.uk/api/search.json?filter_format=grant&count=1` returned `total: 0` on the check date, so the GOV.UK Search API does not carry this catalogue. The public list is server-rendered and needs no login or CAPTCHA. `?page=2` returns the next page. |
| Terms | [Terms and conditions](https://find-government-grants.service.gov.uk/info/terms-and-conditions): “Most content on Find a grant is subject to Crown copyright protection and is published under the Open Government Licence (OGL).” Footer: “All content is available under the Open Government Licence v3.0, except where otherwise stated.” The same page says “You must not try to gain unauthorised access to Find a grant” and “You must not attack Find a grant in any way. This includes denial-of-service attacks.” It does not forbid automated reading of the public pages or commercial reuse. The GOV.UK sentence “You can scrape GOV.UK as long as you respect our robots.txt policy” is on [Reuse GOV.UK content](https://www.gov.uk/help/reuse-govuk-content) and applies to GOV.UK, not this host, so `scraping_permitted` stays false. |
| Robots | `https://find-government-grants.service.gov.uk/robots.txt` is **HTTP 404** HTML (“Page not found”) with `x-robots-tag: index`. No `Disallow` rules are published. The adapter fetches `/robots.txt` and `/grants` only, at most 10 requests per minute. |
| Decision | **Build** `find-a-grant`. `OPEN_LICENSE`, `scraping_permitted = false`, `enabled = false`. Preserve-only. |

## Innovate UK funding competitions — build, disabled

| Field | Evidence |
| --- | --- |
| Official source URL | [Innovation competitions](https://apply-for-innovation-funding.service.gov.uk/competition/search) |
| Machine route | No public JSON or RSS catalogue was found. The search page is public HTML. It returned **HTTP 200** with competition titles, summaries and dates, and no login or CAPTCHA. |
| Terms | [Terms and conditions](https://apply-for-innovation-funding.service.gov.uk/info/terms-and-conditions), section 5: “You can reproduce content published on the Innovate UK website under the Open Government Licence (OGL) as long as you follow the licence conditions.” The same section says “You should contact us if you want to reproduce a piece of content.” Section 2.1 forbids reproducing the site “in contravention of the provisions of the terms” and forbids access “without authority”. It does not forbid automated access to the public competition list. Footer: content is available under the Open Government Licence v3.0 except where otherwise stated. `scraping_permitted` stays false because the terms do not explicitly allow scraping. |
| Robots | `GET https://apply-for-innovation-funding.service.gov.uk/robots.txt` returns **302** to `https://apply-for-innovation-funding.service.gov.uk/login`. No robots file is published. The adapter does not follow that redirect. `/competition/search` is allowed because no `Disallow` exists and the path itself is public. At most 10 requests per minute. |
| Decision | **Build** `innovate-uk`. `OPEN_LICENSE`, `scraping_permitted = false`, `enabled = false`. Preserve-only. A grant whose normalised title matches an existing grant deal is linked onto that deal. |
