export type LanguageModelPurpose =
  | "preview_title"
  | "preview_summary"
  | "intelligence_summary"
  | "buyer_need"
  | "ideal_supplier"
  | "opportunity_extraction";

export type LanguageModelRequest = {
  purpose: LanguageModelPurpose;
  system: string;
  prompt: string;
};

export type LanguageModelResult = {
  text: string;
  providerId: string;
  model: string;
  version: string;
};

export interface LanguageModelProvider {
  readonly id: string;
  readonly model: string;
  readonly version: string;
  readonly callsUsed?: number;
  readonly rateLimited?: boolean;
  generate(request: LanguageModelRequest): Promise<LanguageModelResult | null>;
}

export const RULES_PROVIDER_ID = "rules";

export function createRulesLanguageModel(): LanguageModelProvider {
  return {
    id: RULES_PROVIDER_ID,
    model: "dealatlas-rules",
    version: "1.0.0",
    async generate() {
      return null;
    },
  };
}

function readOptional(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function createHttpLanguageModel(options: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): LanguageModelProvider {
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = options.model ?? "gpt-4o-mini";
  const fetchImpl = options.fetchImpl ?? fetch;
  let blockedUntil = 0;

  return {
    id: "llm",
    model,
    version: model,
    get rateLimited() {
      return blockedUntil > Date.now();
    },
    async generate(request) {
      if (blockedUntil > Date.now()) {
        return null;
      }
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429) {
        blockedUntil = Date.now() + retryAfterMs(response.headers.get("retry-after"));
        return null;
      }
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }
      return {
        text,
        providerId: "llm",
        model: payload.model ?? model,
        version: payload.model ?? model,
      };
    },
  };
}

export const DEFAULT_LLM_MAX_CALLS_PER_RUN = 40;

export function createBudgetedLanguageModel(
  provider: LanguageModelProvider,
  maxCalls: number,
): LanguageModelProvider {
  const limit = Math.max(0, Math.floor(maxCalls));
  if (provider.id === RULES_PROVIDER_ID || limit === 0) {
    return createRulesLanguageModel();
  }

  let callsUsed = 0;
  return {
    id: provider.id,
    model: provider.model,
    version: provider.version,
    get callsUsed() {
      return callsUsed;
    },
    get rateLimited() {
      return provider.rateLimited === true;
    },
    async generate(request) {
      if (callsUsed >= limit) {
        return null;
      }
      callsUsed += 1;
      return provider.generate(request);
    },
  };
}

export function createLanguageModelProvider(
  env: Record<string, string | undefined> = process.env,
): LanguageModelProvider {
  const apiKey = readOptional(env, "DEALATLAS_LLM_API_KEY");
  if (!apiKey) {
    return createRulesLanguageModel();
  }
  const maxCalls = readNonNegativeInt(
    env.DEALATLAS_LLM_MAX_CALLS_PER_RUN,
    DEFAULT_LLM_MAX_CALLS_PER_RUN,
  );
  return createBudgetedLanguageModel(
    createHttpLanguageModel({
      apiKey,
      baseUrl: readOptional(env, "DEALATLAS_LLM_BASE_URL"),
      model: readOptional(env, "DEALATLAS_LLM_MODEL"),
    }),
    maxCalls,
  );
}

function readNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function retryAfterMs(header: string | null): number {
  if (!header) {
    return 60_000;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(15 * 60_000, seconds * 1000);
  }
  const at = Date.parse(header);
  if (Number.isNaN(at)) {
    return 60_000;
  }
  return Math.max(0, Math.min(15 * 60_000, at - Date.now()));
}
