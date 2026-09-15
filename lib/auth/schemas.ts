import { z } from "zod";

import { BUYER_SECTORS, type BuyerSector } from "@/lib/constants";
import { emailSchema } from "@/lib/validation";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72),
});

export const signupFormSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1),
    displayName: z.string().trim().max(80).optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const displayNameSchema = z.object({
  displayName: z.string().trim().max(80),
});

const listItemSchema = z.string().trim().min(1).max(80);

export function parseDelimitedList(
  value: FormDataEntryValue | null,
  maxItems = 40,
): string[] {
  if (typeof value !== "string") {
    return [];
  }

  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 80));

  return [...new Set(items)].slice(0, maxItems);
}

export function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function parseAllowedList(
  formData: FormData,
  key: string,
  allowed: readonly string[],
  maxItems = 40,
): string[] {
  const allowedSet = new Set(allowed);
  const items = formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string" && allowedSet.has(value));
  return [...new Set(items)].slice(0, maxItems);
}

export function parseBuyerSectors(formData: FormData): BuyerSector[] {
  return parseAllowedList(formData, "preferred_buyer_sectors", BUYER_SECTORS) as BuyerSector[];
}

export const companyProfileSchema = z
  .object({
    company_name: z.string().trim().max(200).nullable(),
    company_description: z.string().trim().max(5000).nullable(),
    company_size: z.string().trim().max(80).nullable(),
    products_services: z.array(listItemSchema).max(40),
    keywords: z.array(listItemSchema).max(40),
    negative_keywords: z.array(listItemSchema).max(40),
    preferred_regions: z.array(listItemSchema).max(40),
    preferred_category_slugs: z.array(listItemSchema).max(40),
    preferred_cpv_codes: z.array(listItemSchema).max(40),
    certifications: z.array(listItemSchema).max(40),
    framework_memberships: z.array(listItemSchema).max(40),
    preferred_buyer_sectors: z.array(z.enum(BUYER_SECTORS)),
    minimum_deal_value: z.number().nonnegative().nullable(),
    maximum_deal_value: z.number().nonnegative().nullable(),
  })
  .refine(
    (value) =>
      value.minimum_deal_value === null ||
      value.maximum_deal_value === null ||
      value.minimum_deal_value <= value.maximum_deal_value,
    {
      message: "Minimum deal value cannot be greater than maximum deal value",
      path: ["minimum_deal_value"],
    },
  );

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
