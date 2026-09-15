import { z } from "zod";

import { savedSearchFiltersSchema } from "@/lib/saves/filters";
import { parseInputSafe, uuidSchema } from "@/lib/validation";

export const dealExportRequestSchema = z
  .object({
    dealIds: z.array(uuidSchema).min(1).max(1000).optional(),
    saved: z.literal(true).optional(),
    filters: savedSearchFiltersSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const modes = [
      value.dealIds !== undefined,
      value.saved === true,
      value.filters !== undefined,
    ].filter(Boolean).length;
    if (modes !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of dealIds, saved, or filters.",
      });
    }
  });

export type DealExportRequest = z.infer<typeof dealExportRequestSchema>;

export function parseDealExportRequest(body: unknown): DealExportRequest | null {
  const parsed = parseInputSafe(dealExportRequestSchema, body);
  return parsed.success ? parsed.data : null;
}
