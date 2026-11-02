import { describe, expect, it } from "vitest";

import { classifyOpportunity } from "@/ingestion/discovery/classify";
import type { DiscoveryPage } from "@/ingestion/discovery/types";
import {
  createBudgetedLanguageModel,
  createHttpLanguageModel,
  createLanguageModelProvider,
  createRulesLanguageModel,
  type LanguageModelProvider,
} from "@/ingestion/intelligence/provider";

const PAGE: DiscoveryPage = {
  url: "https://buyer.example/tenders/rfq-1",
  title: "RFQ for grounds maintenance",
  text: "The buyer seeks suppliers for grounds maintenance. Submit by 1 March 2027.",
  html: null,
};

describe("private discovery LLM budget", () => {
  it("falls back to deterministic rules when the per-run call cap is reached", async () => {
    let calls = 0;
    const base: LanguageModelProvider = {
      id: "llm",
      model: "fake-model",
      version: "fake-model",
      async generate() {
        calls += 1;
        return {
          text: JSON.stringify({
            is_opportunity: true,
            opportunity_type: "ITT",
            title: "Grounds maintenance suppliers",
            buyer_name: "Example Buyer",
            summary: "Grounds maintenance services.",
            confidence: 90,
          }),
          providerId: "llm",
          model: "fake-model",
          version: "fake-model",
        };
      },
    };
    const provider = createBudgetedLanguageModel(base, 1);

    const first = await classifyOpportunity({
      page: PAGE,
      provider,
      keywords: ["rfq"],
      matchedKeywords: ["rfq"],
    });
    const second = await classifyOpportunity({
      page: PAGE,
      provider,
      keywords: ["rfq"],
      matchedKeywords: ["rfq"],
    });

    expect(first.method).toBe("LLM");
    expect(second.method).toBe("RULES");
    expect(calls).toBe(1);
    expect(provider.callsUsed).toBe(1);
  });

  it("returns the rules provider when no key or a zero cap is configured", () => {
    expect(createLanguageModelProvider({}).id).toBe("rules");
    expect(
      createLanguageModelProvider({
        DEALATLAS_LLM_API_KEY: "test-key",
        DEALATLAS_LLM_MAX_CALLS_PER_RUN: "0",
      }).id,
    ).toBe("rules");
    expect(createRulesLanguageModel().id).toBe("rules");
  });

  it("handles HTTP 429 once and then fails closed to the rules fallback", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    }) as unknown as typeof fetch;
    const provider = createHttpLanguageModel({ apiKey: "test-key", fetchImpl });

    expect(
      await provider.generate({
        purpose: "opportunity_extraction",
        system: "system",
        prompt: "prompt",
      }),
    ).toBeNull();
    expect(provider.rateLimited).toBe(true);
    expect(
      await provider.generate({
        purpose: "opportunity_extraction",
        system: "system",
        prompt: "prompt",
      }),
    ).toBeNull();
    expect(calls).toBe(1);
  });
});
