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

## Adapter framework

Private/supply-chain sources are onboarded through a **reusable** config + `createPrivateSourceAdapter` (`ingestion/sources/private`). Adding a newly approved source requires:

1. Evidence in this report and on `data_sources`.
2. A source definition (allowlisted host/path, parser, deal-type mapping).
3. Fixtures and extraction tests.
4. Registration in `ingestion/sources/registry.ts` only when automation is allowed.

HTML helpers exist for future `TERMS_REVIEWED` + `scraping_permitted = true` sources. They are not used for UNKNOWN/PROHIBITED rows.

## Attribution

Where OPEN_LICENSE government information is reused:

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
