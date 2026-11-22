import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

import {
  revalidatePublicPreview,
  requestPublicPreviewRevalidation,
} from "@/lib/cache/public-preview";

const SECRET = "r".repeat(32);
const APP_URL = "https://dealatlas.test";

beforeEach(() => {
  mocks.revalidatePath.mockReset();
  mocks.revalidateTag.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("revalidatePublicPreview", () => {
  it("rethrows and logs the slug when revalidatePath throws", async () => {
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error("boom");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      revalidatePublicPreview({ slug: "valid-deal" }),
    ).rejects.toThrow("boom");

    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).toContain("valid-deal");
  });

  it("ignores invalid slugs but still purges the home page and tag", async () => {
    await revalidatePublicPreview({ slug: "Not A Valid Slug" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(
      "/deals/Not A Valid Slug",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith("public-preview", { expire: 0 });
    expect(mocks.revalidateTag).not.toHaveBeenCalledWith(
      "public-preview:Not A Valid Slug",
      { expire: 0 },
    );
  });
});

describe("requestPublicPreviewRevalidation", () => {
  it("warns and returns not_configured when the env is incomplete", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn();

    const result = await requestPublicPreviewRevalidation({
      slugs: ["valid-deal"],
      env: {},
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[public-preview] revalidate not configured; cached pages expire within 300s",
      { slugs: ["valid-deal"] },
    );
  });

  it("sends a Bearer token and the slug payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );

    const result = await requestPublicPreviewRevalidation({
      slugs: ["valid-deal"],
      previousSlugs: ["old-deal"],
      env: {
        REVALIDATE_SECRET: SECRET,
        NEXT_PUBLIC_APP_URL: APP_URL,
      },
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${APP_URL}/api/internal/revalidate`);
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SECRET}`,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      slugs: ["valid-deal"],
      previousSlugs: ["old-deal"],
    });
  });

  it("warns and resolves not_found on a 404 response without throwing", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));

    const result = await requestPublicPreviewRevalidation({
      slugs: ["valid-deal"],
      env: {
        REVALIDATE_SECRET: SECRET,
        NEXT_PUBLIC_APP_URL: APP_URL,
      },
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[public-preview] revalidate endpoint returned 404 (REVALIDATE_SECRET not set on the app yet?); cached pages expire within 300s",
      { slugs: ["valid-deal"] },
    );
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain(SECRET);
  });

  it("throws when the revalidate request cannot reach the app", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    });

    await expect(
      requestPublicPreviewRevalidation({
        slugs: ["valid-deal"],
        env: {
          REVALIDATE_SECRET: SECRET,
          NEXT_PUBLIC_APP_URL: APP_URL,
        },
        fetchImpl,
      }),
    ).rejects.toThrow("public-preview revalidate failed");

    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(SECRET);
  });

  it("throws and logs slugs without the secret on a 500 response", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));

    await expect(
      requestPublicPreviewRevalidation({
        slugs: ["valid-deal"],
        env: {
          REVALIDATE_SECRET: SECRET,
          NEXT_PUBLIC_APP_URL: APP_URL,
        },
        fetchImpl,
      }),
    ).rejects.toThrow("public-preview revalidate failed");

    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain("valid-deal");
    expect(logged).not.toContain(SECRET);
  });
});
