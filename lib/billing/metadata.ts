export const CHECKOUT_METADATA_KEYS = {
  userId: "user_id",
  planKey: "plan_key",
} as const;

export function checkoutMetadata(input: {
  userId: string;
  planKey: string;
}): Record<string, string> {
  return {
    [CHECKOUT_METADATA_KEYS.userId]: input.userId,
    [CHECKOUT_METADATA_KEYS.planKey]: input.planKey,
  };
}

export function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
