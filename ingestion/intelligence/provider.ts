export type LanguageModelPurpose =
  | "preview_title"
  | "preview_summary"
  | "intelligence_summary"
  | "buyer_need"
  | "ideal_supplier";

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

  return {
    id: "llm",
    model,
    version: model,
    async generate(request) {
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

export function createLanguageModelProvider(
  env: Record<string, string | undefined> = process.env,
): LanguageModelProvider {
  const apiKey = readOptional(env, "DEALATLAS_LLM_API_KEY");
  if (!apiKey) {
    return createRulesLanguageModel();
  }
  return createHttpLanguageModel({
    apiKey,
    baseUrl: readOptional(env, "DEALATLAS_LLM_BASE_URL"),
    model: readOptional(env, "DEALATLAS_LLM_MODEL"),
  });
}
