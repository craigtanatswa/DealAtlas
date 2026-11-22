import { createHash, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { revalidatePublicPreview } from "@/lib/cache/public-preview";
import {
  clientKeyFromRequest,
  retryAfterSeconds,
  sharedRateLimit,
} from "@/lib/security/rate-limit";
import { slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const RATE_LIMIT = {
  bucket: "internal-revalidate",
  limit: 30,
  windowMs: 60_000,
} as const;
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const MAX_SLUGS = 50;
const MIN_SECRET_LENGTH = 32;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, ...headers },
  });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function slugList(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SLUGS) {
    return null;
  }
  const slugs: string[] = [];
  for (const entry of value) {
    const parsed = slugSchema.safeParse(entry);
    if (!parsed.success) {
      return null;
    }
    slugs.push(parsed.data);
  }
  return slugs;
}

export async function POST(request: NextRequest) {
  const limited = await sharedRateLimit(
    clientKeyFromRequest(request, RATE_LIMIT.bucket),
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs,
  );
  if (!limited.ok) {
    return json(
      { error: "Too many requests. Try again shortly." },
      429,
      { "Retry-After": String(retryAfterSeconds(limited)) },
    );
  }

  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return json({ error: "Not found." }, 404);
  }
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !timingSafeEqual(digest(token), digest(secret))) {
    return json({ error: "Not found." }, 404);
  }

  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw.trim()) {
      body = JSON.parse(raw);
    }
  } catch {
    return json({ error: "Invalid slug." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid slug." }, 400);
  }

  const record = body as Record<string, unknown>;
  const slugs = slugList(record.slugs);
  const previousSlugs = slugList(record.previousSlugs);
  if (!slugs || !previousSlugs) {
    return json({ error: "Invalid slug." }, 400);
  }

  try {
    for (const slug of slugs) {
      await revalidatePublicPreview({ slug });
    }
    for (const previousSlug of previousSlugs) {
      await revalidatePublicPreview({ slug: null, previousSlug });
    }
    await revalidatePublicPreview({});
    return json({
      ok: true,
      revalidated: slugs.length + previousSlugs.length,
    });
  } catch {
    return json({ error: "Internal error." }, 500);
  }
}
