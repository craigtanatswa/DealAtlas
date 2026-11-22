import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";

import type { Database } from "@/lib/db/database.types";
import { slugSchema } from "@/lib/validation";
import {
  PUBLIC_PREVIEW_TAG,
  publicPreviewSlugTag,
  type PublicPreviewRevalidationInput,
  type PublicPreviewRevalidationResult,
  requestPublicPreviewRevalidation,
} from "@/lib/cache/public-preview-remote";

export {
  PUBLIC_PREVIEW_TAG,
  publicPreviewSlugTag,
  requestPublicPreviewRevalidation,
};
export type {
  PublicPreviewRevalidationInput,
  PublicPreviewRevalidationResult,
};

function validSlug(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = slugSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function revalidatePublicPreview({
  slug,
  previousSlug,
}: {
  slug?: string | null;
  previousSlug?: string | null;
}): Promise<void> {
  const current = validSlug(slug);
  const previous = validSlug(previousSlug);

  try {
    revalidatePath("/");
    if (current) {
      revalidatePath(`/deals/${current}`);
    }
    if (previous) {
      revalidatePath(`/deals/${previous}`);
    }
    // expire: 0 = immediate purge (a leak-fix re-sanitise must not serve stale).
    revalidateTag(PUBLIC_PREVIEW_TAG, { expire: 0 });
    for (const value of new Set([current, previous])) {
      if (value) {
        revalidateTag(publicPreviewSlugTag(value), { expire: 0 });
      }
    }
  } catch (error) {
    console.error("[public-preview] revalidate failed", {
      slug,
      previousSlug,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

export async function slugForDealId(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("deal_previews")
    .select("slug")
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load public preview slug");
  }

  return typeof data?.slug === "string" ? data.slug : null;
}
