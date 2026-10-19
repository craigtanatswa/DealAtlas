import { NextResponse, type NextRequest } from "next/server";

import { POSTHOG_EU_API_HOST, configuredPostHogKey } from "@/lib/analytics/config";
import {
  INGEST_EVENT_PATHS,
  MAX_INGEST_BODY_BYTES,
  decodeIngestBody,
  sanitizeIngestEvents,
} from "@/lib/analytics/ingest-proxy";
import { normalizeOrigin } from "@/lib/analytics/sanitize";
import { serverAnalyticsKey } from "@/lib/analytics/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE });
}

function accepted() {
  return NextResponse.json({ status: 1 }, { status: 200, headers: NO_STORE });
}

function allowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  const app = process.env.NEXT_PUBLIC_APP_URL ? normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) : null;
  if (app) {
    origins.add(app);
  }
  return origins;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const apiKey = configuredPostHogKey();
  if (!apiKey) {
    return notFound();
  }
  const { path } = await context.params;
  const joined = path.join("/");
  if (!INGEST_EVENT_PATHS.has(joined)) {
    return notFound();
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_INGEST_BODY_BYTES) {
    return new NextResponse(null, { status: 413, headers: NO_STORE });
  }

  let decoded: unknown;
  try {
    decoded = decodeIngestBody(
      bytes,
      request.headers.get("content-type"),
      request.nextUrl.searchParams.get("compression"),
    );
  } catch {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  // Only our own project's events are forwarded.
  const events = sanitizeIngestEvents(decoded, allowedOrigins(request)).filter(
    (event) => event.properties.token === apiKey,
  );
  // With DEALATLAS_ANALYTICS_UPSTREAM=off (CI), events are checked but not sent.
  if (events.length === 0 || !serverAnalyticsKey()) {
    return accepted();
  }

  try {
    const upstream = await fetch(`${POSTHOG_EU_API_HOST}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, batch: events }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return NextResponse.json(
      { status: upstream.ok ? 1 : 0 },
      { status: upstream.ok ? 200 : 502, headers: NO_STORE },
    );
  } catch {
    return new NextResponse(null, { status: 502, headers: NO_STORE });
  }
}

export async function GET() {
  return notFound();
}
