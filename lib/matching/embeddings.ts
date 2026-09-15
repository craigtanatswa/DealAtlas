export type EmbeddingConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type EmbeddingProvider = {
  readonly model: string;
  embed(texts: string[]): Promise<number[][] | null>;
};

const DEFAULT_EMBEDDING_URL = "https://api.openai.com/v1";

function readOptional(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function embeddingConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmbeddingConfig | null {
  const model = readOptional(env, "DEALATLAS_EMBEDDING_MODEL");
  const apiKey =
    readOptional(env, "DEALATLAS_EMBEDDING_API_KEY") ??
    readOptional(env, "DEALATLAS_LLM_API_KEY");
  if (!model || !apiKey) {
    return null;
  }
  return {
    apiKey,
    model,
    baseUrl: (readOptional(env, "DEALATLAS_EMBEDDING_BASE_URL") ??
      readOptional(env, "DEALATLAS_LLM_BASE_URL") ??
      DEFAULT_EMBEDDING_URL).replace(/\/$/, ""),
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function similarityToScore(similarity: number): number {
  const clamped = Math.max(0, Math.min(1, similarity));
  return Math.round(clamped * 1000) / 10;
}

export function createHttpEmbeddingProvider(
  config: EmbeddingConfig,
  fetchImpl: typeof fetch = fetch,
): EmbeddingProvider {
  return {
    model: config.model,
    async embed(texts) {
      const inputs = texts.map((text) => text.trim()).filter(Boolean);
      if (inputs.length === 0) {
        return null;
      }
      try {
        const response = await fetchImpl(`${config.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            input: inputs,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };
        if (!payload.data || payload.data.length !== inputs.length) {
          return null;
        }
        const ordered = [...payload.data].sort(
          (a, b) => (a.index ?? 0) - (b.index ?? 0),
        );
        const vectors = ordered.map((item) => item.embedding);
        if (vectors.some((item) => !Array.isArray(item) || item.length === 0)) {
          return null;
        }
        return vectors as number[][];
      } catch {
        return null;
      }
    },
  };
}

export function createEmbeddingProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): EmbeddingProvider | null {
  const config = embeddingConfigFromEnv(env);
  if (!config) {
    return null;
  }
  return createHttpEmbeddingProvider(config, fetchImpl ?? fetch);
}
