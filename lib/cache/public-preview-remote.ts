export const PUBLIC_PREVIEW_TAG = "public-preview";

export function publicPreviewSlugTag(slug: string): string {
  return `${PUBLIC_PREVIEW_TAG}:${slug}`;
}

export type PublicPreviewRevalidationInput = {
  slugs?: readonly string[] | null;
  previousSlugs?: readonly string[] | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

export type PublicPreviewRevalidationResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "not_found" };

export async function requestPublicPreviewRevalidation(
  input: PublicPreviewRevalidationInput = {},
): Promise<PublicPreviewRevalidationResult> {
  const slugs = [...(input.slugs ?? [])];
  const previousSlugs = [...(input.previousSlugs ?? [])];
  const env = input.env ?? process.env;
  const secret = env.REVALIDATE_SECRET?.trim();
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();

  if (!secret || !appUrl) {
    console.warn(
      "[public-preview] revalidate not configured; cached pages expire within 300s",
      { slugs },
    );
    return { ok: false, reason: "not_configured" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${appUrl.replace(/\/+$/, "")}/api/internal/revalidate`;
  const body = previousSlugs.length > 0
    ? { slugs, previousSlugs }
    : { slugs };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[public-preview] revalidate request failed", {
      slugs,
      status: null,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw new Error("public-preview revalidate failed");
  }

  if (response.status === 404) {
    console.warn(
      "[public-preview] revalidate endpoint returned 404 (REVALIDATE_SECRET not set on the app yet?); cached pages expire within 300s",
      { slugs },
    );
    return { ok: false, reason: "not_found" };
  }

  if (!response.ok) {
    console.error("[public-preview] revalidate request failed", {
      slugs,
      status: response.status,
    });
    throw new Error("public-preview revalidate failed");
  }

  return { ok: true };
}
