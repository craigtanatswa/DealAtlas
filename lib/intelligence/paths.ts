import { uuidSchema } from "@/lib/validation";

export function appBuyerPath(organizationId: string): string {
  return `/app/buyers/${organizationId}`;
}

export function appSupplierPath(organizationId: string): string {
  return `/app/suppliers/${organizationId}`;
}

export function parseOrganizationIdParam(value: unknown): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const APP_BUYER_PATH =
  /^\/app\/buyers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const APP_SUPPLIER_PATH =
  /^\/app\/suppliers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
