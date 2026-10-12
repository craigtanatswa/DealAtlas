import { alertDepsFromEnv } from "@/lib/leak-scan/alert";

export const LIVE_PUBLISHED_MINIMUM = 100;

export type PublishJobStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export type PublishJobResult = {
  status: PublishJobStatus;
  dryRun: boolean;
  publishedLive: number;
  counts: Record<string, number>;
};

type QueryResult = { count: number | null; error: { message: string } | null };
type RpcResult = { data: unknown; error: { message: string } | null };

export type PublishJobClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (column: string, value: boolean) => PromiseLike<QueryResult>;
    };
  };
};

function numericCounts(data: unknown): Record<string, number> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    counts[key] = value;
  }
  return counts;
}

export function publishAlertText(input: {
  job: string;
  status: string;
  publishedLive: number;
  counts: Record<string, number>;
}): string {
  const lines = [
    `job=${input.job}`,
    `status=${input.status}`,
    `published_live=${input.publishedLive}`,
    ...Object.keys(input.counts)
      .sort()
      .map((key) => `${key}=${input.counts[key]}`),
  ];
  return lines.join("\n");
}

async function countPublished(client: PublishJobClient): Promise<number> {
  const { count, error } = await client
    .from("deal_previews")
    .select("deal_id", { count: "exact", head: true })
    .eq("is_published", true);
  if (error) {
    throw new Error("published count failed");
  }
  return count ?? 0;
}

async function notify(
  input: {
    job: string;
    status: string;
    publishedLive: number;
    counts: Record<string, number>;
    mode: string;
    env: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    alert?: (subject: string, text: string) => Promise<void>;
  },
): Promise<void> {
  const text = publishAlertText(input);
  if (input.alert) {
    await input.alert(`DealAtlas publish ${input.status}`, text);
    return;
  }
  if (input.mode !== "live") {
    return;
  }
  await alertDepsFromEnv(input.env, input.fetchImpl).email(
    `DealAtlas publish ${input.status}`,
    text,
  );
}

export async function runPublishEligible(input: {
  mode: string;
  client: PublishJobClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  alert?: (subject: string, text: string) => Promise<void>;
}): Promise<PublishJobResult> {
  const publishedLive = await countPublished(input.client);
  if (input.mode !== "live") {
    return { status: "SUCCEEDED", dryRun: true, publishedLive, counts: {} };
  }
  const { data, error } = await input.client.rpc("publish_eligible_previews", {
    p_cap: 300,
    p_run_id: input.env?.GITHUB_RUN_ID ?? null,
  });
  const counts = error ? null : numericCounts(data);
  const after = await countPublished(input.client);
  if (!counts) {
    await notify({
      job: "publish-eligible",
      status: "FAILED",
      publishedLive: after,
      counts: {},
      mode: input.mode,
      env: input.env ?? {},
      fetchImpl: input.fetchImpl,
      alert: input.alert,
    });
    return { status: "FAILED", dryRun: false, publishedLive: after, counts: {} };
  }
  const status: PublishJobStatus = after < LIVE_PUBLISHED_MINIMUM ? "PARTIAL" : "SUCCEEDED";
  if (status === "PARTIAL") {
    await notify({
      job: "publish-eligible",
      status,
      publishedLive: after,
      counts,
      mode: input.mode,
      env: input.env ?? {},
      fetchImpl: input.fetchImpl,
      alert: input.alert,
    });
  }
  return { status, dryRun: false, publishedLive: after, counts };
}

export async function runUnpublishStale(input: {
  mode: string;
  client: PublishJobClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  alert?: (subject: string, text: string) => Promise<void>;
}): Promise<PublishJobResult> {
  const publishedLive = await countPublished(input.client);
  if (input.mode !== "live") {
    return { status: "SUCCEEDED", dryRun: true, publishedLive, counts: {} };
  }
  const { data, error } = await input.client.rpc("unpublish_stale_previews", {
    p_run_id: input.env?.GITHUB_RUN_ID ?? null,
  });
  const counts = error ? null : numericCounts(data);
  const after = await countPublished(input.client);
  if (!counts) {
    await notify({
      job: "unpublish-stale",
      status: "FAILED",
      publishedLive: after,
      counts: {},
      mode: input.mode,
      env: input.env ?? {},
      fetchImpl: input.fetchImpl,
      alert: input.alert,
    });
    return { status: "FAILED", dryRun: false, publishedLive: after, counts: {} };
  }
  return { status: "SUCCEEDED", dryRun: false, publishedLive: after, counts };
}

export async function runPublishAlert(input: {
  mode: string;
  client: PublishJobClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  alert?: (subject: string, text: string) => Promise<void>;
}): Promise<PublishJobResult> {
  const publishedLive = await countPublished(input.client);
  if (input.mode !== "live") {
    return { status: "SUCCEEDED", dryRun: true, publishedLive, counts: {} };
  }
  const status: PublishJobStatus = publishedLive < LIVE_PUBLISHED_MINIMUM ? "PARTIAL" : "SUCCEEDED";
  await notify({
    job: "publish-alert",
    status,
    publishedLive,
    counts: {},
    mode: input.mode,
    env: input.env ?? {},
    fetchImpl: input.fetchImpl,
    alert: input.alert,
  });
  return { status, dryRun: false, publishedLive, counts: {} };
}
