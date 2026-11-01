import { z } from "zod";

import type {
  DiscoveryPage,
  OpportunityExtraction,
} from "@/ingestion/discovery/types";
import { prefilterOpportunity } from "@/ingestion/discovery/keywords";
import type {
  LanguageModelProvider,
} from "@/ingestion/intelligence/provider";
import { mapPrivateDealType } from "@/ingestion/sources/private/mapping";
import { BROAD_REGIONS } from "@/lib/preview/region";
import type { DealType } from "@/lib/search/filters";
import { DEAL_TYPES } from "@/lib/search/filters";

const extractionSchema = z.object({
  is_opportunity: z.boolean(),
  opportunity_type: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  buyer_name: z.string().nullable().optional(),
  buyer_domain: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  budget_text: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  requirements: z.array(z.string()).max(20).optional(),
  rejection_reason: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type ClassifiedOpportunity = {
  extraction: OpportunityExtraction;
  method: "RULES" | "LLM";
  modelVersion: string;
};

const SYSTEM_PROMPT = [
  "You extract procurement opportunities from UK supplier-facing pages.",
  "Return one JSON object only, with snake_case keys.",
  "Never invent a buyer, deadline, budget, sector or requirement.",
  "Use null when the page does not state a value.",
  "A live opportunity is an RFQ, RFP, ITT, EOI, RFI, framework, subcontract, supply-chain or other request for suppliers.",
  "Job vacancies, press releases, award notices, expired notices and supplier-registration pages are not live opportunities.",
  "Supplier onboarding pages must use opportunity_type SUPPLIER_ONBOARDING and is_opportunity false.",
  "confidence is 0-100 and reflects how clearly the page supports the extraction.",
].join(" ");

export async function classifyOpportunity(input: {
  page: DiscoveryPage;
  provider: LanguageModelProvider;
  keywords: string[];
  matchedKeywords?: string[];
}): Promise<ClassifiedOpportunity> {
  const rules = rulesExtraction(input.page, input.matchedKeywords ?? []);
  if (input.provider.id === "rules") {
    return { extraction: rules, method: "RULES", modelVersion: `${input.provider.model}:${input.provider.version}` };
  }

  try {
    const response = await input.provider.generate({
      purpose: "opportunity_extraction",
      system: SYSTEM_PROMPT,
      prompt: [
        `Source URL: ${input.page.url}`,
        `Page title: ${input.page.title}`,
        `Matched keywords: ${(input.matchedKeywords ?? []).join(", ") || "none"}`,
        "Page text:",
        input.page.text.slice(0, 12_000),
      ].join("\n"),
    });
    if (!response) {
      return { extraction: rules, method: "RULES", modelVersion: `${input.provider.model}:${input.provider.version}` };
    }
    const parsed = extractionSchema.safeParse(parseJsonObject(response.text));
    if (!parsed.success) {
      return { extraction: rules, method: "RULES", modelVersion: `${input.provider.model}:${input.provider.version}` };
    }
    const data = parsed.data;
    const opportunityType = normalizeOpportunityType(data.opportunity_type);
    return {
      extraction: {
        isOpportunity: data.is_opportunity,
        opportunityType,
        title: cleanText(data.title) ?? rules.title,
        buyerName: cleanText(data.buyer_name),
        buyerDomain: cleanText(data.buyer_domain),
        summary: cleanText(data.summary),
        deadline: normalizeDeadline(data.deadline),
        budgetText: cleanText(data.budget_text),
        sector: cleanText(data.sector),
        location: cleanText(data.location),
        requirements:
          data.requirements?.map((item) => item.trim()).filter(Boolean).slice(0, 20) ?? [],
        rejectionReason: cleanText(data.rejection_reason),
        confidence: clampConfidence(data.confidence ?? rules.confidence),
      },
      method: "LLM",
      modelVersion: response.model,
    };
  } catch {
    return { extraction: rules, method: "RULES", modelVersion: `${input.provider.model}:${input.provider.version}` };
  }
}

export function rulesExtraction(
  page: DiscoveryPage,
  matchedKeywords: string[],
): OpportunityExtraction {
  const haystack = `${page.title}\n${page.text}`;
  const prefilter = prefilterOpportunity({
    title: page.title,
    text: page.text,
    keywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
  });
  const opportunityType = prefilter.onboarding
    ? "SUPPLIER_ONBOARDING"
    : mapPrivateDealType({
        opportunityKind: page.title,
        schemeStatus: null,
        procurementStage: null,
      });
  const buyerName = extractBuyerNames(haystack)[0] ?? null;
  const deadline = extractDeadline(haystack);
  const location = BROAD_REGIONS.find((region) =>
    haystack.toLowerCase().includes(region.toLowerCase()),
  ) ?? null;
  const summary = summarize(page.text);
  const requirements = extractRequirements(page.text);

  let confidence = 35;
  if (matchedKeywords.length > 0) confidence += 15;
  if (matchedKeywords.length > 2) confidence += 5;
  if (deadline) confidence += 10;
  if (buyerName) confidence += 10;
  if (opportunityType !== "OTHER") confidence += 10;
  if (prefilter.onboarding) confidence = Math.max(confidence, 65);

  return {
    isOpportunity:
      !prefilter.onboarding &&
      prefilter.disqualifiers.length === 0 &&
      prefilter.classify,
    opportunityType,
    title: cleanText(page.title)?.slice(0, 500) ?? null,
    buyerName,
    buyerDomain: null,
    summary,
    deadline,
    budgetText: extractBudget(haystack),
    sector: extractSector(haystack),
    location,
    requirements,
    rejectionReason: prefilter.reason,
    confidence: clampConfidence(Math.min(70, confidence)),
  };
}

export function normalizeOpportunityType(value: string | null | undefined): DealType | null {
  const text = cleanText(value)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (!text) {
    return null;
  }
  if ((DEAL_TYPES as readonly string[]).includes(text)) {
    return text as DealType;
  }
  return mapPrivateDealType({ opportunityKind: value, schemeStatus: null, procurementStage: null });
}

export function normalizeDeadline(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseJsonObject(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? value).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractBuyerNames(text: string): string[] {
  const names: string[] = [];
  for (const pattern of [
    /\b(?:buyer|client|organisation|organization|issued by|contracting authority)\s*[:\-]\s*([A-Z][^\n.;]{2,90})/g,
    /\b([A-Z][A-Za-z0-9&.' -]{2,70}(?:Ltd|Limited|PLC|LLP|Council|University|NHS Trust|Authority|Board))\b/g,
  ]) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name && !names.some((item) => item.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    }
  }
  return names;
}

function extractDeadline(text: string): string | null {
  const explicit = text.match(
    /\b(?:deadline|closing date|closes?|submit(?:ted)? by|responses? by|return(?:ed)? by|tenders? by)\b[^\n.]{0,100}/i,
  )?.[0];
  const source = explicit ?? text;
  const datePatterns = [
    /\b([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)[0-9]{2})\b/i,
    /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+[0-3]?[0-9](?:st|nd|rd|th)?,?\s+(?:19|20)[0-9]{2})\b/i,
    /\b([0-3]?[0-9][/.-][01]?[0-9][/.-](?:19|20)?[0-9]{2})\b/,
  ];
  for (const pattern of datePatterns) {
    const match = source.match(pattern);
    if (match) {
      const parsed = new Date(match[1].replace(/(\d)(st|nd|rd|th)/i, "$1"));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  return null;
}

function summarize(text: string): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return sentences.slice(0, 2).join(" ").trim().slice(0, 500) || null;
}

function extractRequirements(text: string): string[] {
  const requirements: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const item = line.replace(/^\s*[-*•]\s*/, "").trim();
    if (item.length >= 12 && item.length <= 240) {
      if (/\b(must|required|requirement|provide|supply|deliver|experience|able to|compliance)\b/i.test(item)) {
        requirements.push(item);
      }
    }
    if (requirements.length >= 10) {
      break;
    }
  }
  return [...new Set(requirements)];
}

function extractBudget(text: string): string | null {
  const match = text.match(/(?:budget|value|contract value)\s*[:\-]?\s*(£\s?[0-9][0-9,.]*(?:\s?(?:k|m|million|thousand))?)/i);
  return match?.[1]?.trim() ?? null;
}

function extractSector(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [sector, pattern] of [
    ["Technology", /\b(software|ict|it support|cloud|data platform|cyber)\b/],
    ["Construction & Infrastructure", /\b(construction|infrastructure|building|refurbishment|civil engineering)\b/],
    ["Facilities & Property", /\b(facilities|cleaning|security services|property maintenance)\b/],
    ["Healthcare", /\b(nhs|healthcare|medical|clinical)\b/],
    ["Education", /\b(school|college|university|education)\b/],
    ["Transport & Logistics", /\b(transport|logistics|fleet|freight)\b/],
    ["Manufacturing & Industrial", /\b(manufacturing|industrial|machinery)\b/],
    ["Marketing & Creative", /\b(marketing|creative|design|communications)\b/],
    ["Energy & Utilities", /\b(energy|utilities|water|electricity|gas)\b/],
  ] as const) {
    if (pattern.test(lower)) {
      return sector;
    }
  }
  return null;
}
