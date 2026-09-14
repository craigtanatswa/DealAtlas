import { describe, expect, it } from "vitest";

import {
  parseInput,
  parseInputSafe,
  paginationSchema,
  slugSchema,
  uuidSchema,
  ValidationError,
} from "@/lib/validation";

describe("validation conventions", () => {
  it("parses a UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(uuidSchema.parse(id)).toBe(id);
  });

  it("rejects an invalid slug", () => {
    expect(slugSchema.safeParse("Not A Slug").success).toBe(false);
  });

  it("applies the default page size", () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 20 });
  });

  it("throws ValidationError with parseInput", () => {
    expect(() => parseInput(uuidSchema, "nope", "Deal id")).toThrow(
      ValidationError,
    );
  });

  it("returns a safe parse result without throwing", () => {
    expect(parseInputSafe(slugSchema, "cloud-contact-centre").success).toBe(
      true,
    );
  });
});
