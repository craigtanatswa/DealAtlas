import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATES_DIR = path.join(ROOT, "supabase", "templates");
const CONFIG_PATH = path.join(ROOT, "supabase", "config.toml");

const FILES = {
  confirmation: { file: "confirmation.html", type: "email", extra: [] },
  invite: { file: "invite.html", type: "invite", extra: [] },
  magic_link: { file: "magic_link.html", type: "magiclink", extra: [] },
  email_change: { file: "email_change.html", type: "email_change", extra: ["{{ .NewEmail }}"] },
  recovery: { file: "recovery.html", type: "recovery", extra: [] },
} as const;

const LEAK = [
  "buyer",
  "source url",
  "notice id",
  "find a tender",
  "contracts finder",
] as const;

function read(name: string) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8");
}

describe("auth email templates", () => {
  const config = fs.readFileSync(CONFIG_PATH, "utf8");

  it("wires every GoTrue auth template in config.toml", () => {
    for (const key of [
      "confirmation",
      "invite",
      "magic_link",
      "email_change",
      "recovery",
      "reauthentication",
    ]) {
      expect(config).toContain(`[auth.email.template.${key}]`);
      expect(config).toContain(`./supabase/templates/${key}.html`);
    }
    expect(config).toContain('subject = "{{ .Token }} is your DealAtlas verification code"');
  });

  it("matches brand chrome and avoids ConfirmationURL prefetch", () => {
    const names = [
      ...Object.values(FILES).map((entry) => entry.file),
      "reauthentication.html",
    ];
    for (const name of names) {
      const html = read(name);
      expect(html).toContain("#0B1F33");
      expect(html).toContain("#0F9F8F");
      expect(html).toContain("DealAtlas");
      expect(html).not.toContain("ConfirmationURL");
      expect(html).toContain("{{ .Token }}");
      const lower = html.toLowerCase();
      for (const phrase of LEAK) {
        expect(lower).not.toContain(phrase);
      }
    }
    for (const entry of Object.values(FILES)) {
      expect(read(entry.file)).toContain("#2563EB");
    }
  });

  it("builds PKCE confirm links with the matching otp type", () => {
    for (const entry of Object.values(FILES)) {
      const html = read(entry.file);
      expect(html).toContain("/auth/confirm?token_hash={{ .TokenHash }}");
      expect(html).toContain(`&amp;type=${entry.type}`);
      for (const extra of entry.extra) {
        expect(html).toContain(extra);
      }
    }
  });

  it("keeps reauthentication code-only so there is no prefetchable link", () => {
    const html = read("reauthentication.html");
    expect(html).not.toContain("token_hash");
    expect(html).not.toContain("/auth/confirm");
    expect(html).toContain("{{ .Token }}");
  });
});
