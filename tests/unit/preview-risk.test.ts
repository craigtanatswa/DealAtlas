import { describe, expect, it } from "vitest";

import { freeTextRisk } from "@/lib/preview/risk";

describe("free-text risk detector (P1-3)", () => {
  it.each([
    ["Delivered for WESTFORD BOROUGH COUNCIL", "uppercase_token"],
    ["Call-off under YPO", "uppercase_token"],
    ["NEPO members only", "uppercase_token"],
    ["Email bids@westford.gov.uk", "email"],
    ["See https://westford.gov.uk", "url"],
    ["Details at www.example.org", "url"],
    ["Details at westford-procurement.co.uk", "domain"],
    ["Call 01793 466000", "phone"],
    ["Extension ext 42", "phone"],
    ["Release ocds-h6vhtk-123", "ocds"],
    ["Id tender_123456", "tender_id"],
    ["Notice 012345-2026", "fts_id"],
    ["Ref: ABC/XYZ", "ref"],
    ["reference # alpha", "ref"],
    ["Under rm6187 terms", "rm_code"],
    ["Closes in 21 days", "day_count"],
    ["Questions close in 3 days", "day_count"],
    ["Deliver to SN1 2JH", "postcode"],
    ["Use the esourcing portal", "portal"],
    ["Bids through in-tend", "portal"],
    ["Hosted on proactis", "portal"],
    ["via bluelight", "portal"],
    ["Technology Products and Services lots", "framework_name"],
    ["listed on g-cloud", "framework_name"],
    ["Delivery to swindon offices", "place"],
  ])("flags %s", (text, code) => {
    expect(freeTextRisk(text)).toBe(code);
  });

  it.each([
    "Managed service desk and endpoint management for staff",
    "ISO 27001 and Cyber Essentials Plus required with GDPR duties",
    "Install LED lighting and CCTV across sites",
    "We intend to appoint a single supplier",
  ])("passes generic prose: %s", (text) => {
    expect(freeTextRisk(text)).toBeNull();
  });
});
