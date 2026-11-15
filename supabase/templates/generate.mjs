/**
 * Writes branded GoTrue HTML for local `config.toml` content_path files.
 * Run: node supabase/templates/generate.mjs
 *
 * Links use Site URL + token_hash + /auth/confirm so PKCE verifyOtp runs
 * server-side. Do not use ConfirmationURL as the primary CTA (email scanners
 * prefetch and consume it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const NAVY = "#0B1F33";
const BLUE = "#2563EB";
const TEAL = "#0F9F8F";
const SLATE_50 = "#F8FAFC";
const SLATE_100 = "#F1F5F9";
const SLATE_200 = "#E2E8F0";
const SLATE_500 = "#64748B";
const SLATE_700 = "#334155";
const WHITE = "#FFFFFF";
const FONT = "Inter,'Segoe UI',Helvetica,Arial,sans-serif";

function confirmHref(type) {
  return `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;
}

function button(href, label) {
  return `
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                            <tr>
                              <td align="center" bgcolor="${BLUE}" style="border-radius:8px;background-color:${BLUE};">
                                <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${WHITE};text-decoration:none;border-radius:8px;">${label}</a>
                              </td>
                            </tr>
                          </table>`.trim();
}

function otpBlock(label) {
  return `
                          <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${SLATE_500};">${label}</p>
                          <p style="margin:0 0 24px 0;padding:12px 16px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:22px;line-height:28px;letter-spacing:0.18em;font-weight:600;color:${NAVY};text-align:center;background-color:${SLATE_50};border:1px solid ${SLATE_200};border-radius:8px;">{{ .Token }}</p>`.trim();
}

function layout({ preheader, title, paragraphs, cta, otpLabel, extraHtml = "" }) {
  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${SLATE_700};">${text}</p>`,
    )
    .join("\n                          ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DealAtlas</title>
  </head>
  <body style="margin:0;padding:0;background-color:${SLATE_100};">
    <div style="display:none;font-size:1px;color:${SLATE_100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SLATE_100};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:${WHITE};border:1px solid ${SLATE_200};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 28px;background-color:${NAVY};">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:10px;height:10px;background-color:${TEAL};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
                    <td style="padding-left:10px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${WHITE};letter-spacing:-0.02em;">DealAtlas</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px 28px;">
                          <h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;color:${NAVY};">${title}</h1>
                          ${body}
                          ${[
                            cta ? button(cta.href, cta.label) : "",
                            otpLabel ? otpBlock(otpLabel) : "",
                            extraHtml,
                          ]
                            .filter(Boolean)
                            .join("\n                          ")}
                          <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${SLATE_500};">If you did not request this, you can ignore this email. Your account stays unchanged.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;border-top:1px solid ${SLATE_200};">
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${SLATE_500};">UK B2B opportunity intelligence</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

const templates = {
  "confirmation.html": layout({
    preheader: "Confirm your DealAtlas email address.",
    title: "Confirm your email",
    paragraphs: [
      "Use the button below to confirm this email address for your DealAtlas account. The link expires shortly and can only be used once.",
    ],
    cta: { href: confirmHref("email"), label: "Confirm email" },
    otpLabel: "Or enter this code in DealAtlas",
  }),
  "invite.html": layout({
    preheader: "You are invited to create a DealAtlas account.",
    title: "You are invited",
    paragraphs: [
      "This address was invited to create a DealAtlas account. Use the button below to continue. The link expires shortly and can only be used once.",
    ],
    cta: { href: confirmHref("invite"), label: "Accept invitation" },
    otpLabel: "Or enter this code in DealAtlas",
  }),
  "magic_link.html": layout({
    preheader: "Your DealAtlas sign-in link and one-time code.",
    title: "Sign in to DealAtlas",
    paragraphs: [
      "Use the button below to sign in. If you requested a one-time code, enter it instead. This link expires shortly and can only be used once.",
    ],
    cta: { href: confirmHref("magiclink"), label: "Sign in" },
    otpLabel: "Your one-time code",
  }),
  "email_change.html": layout({
    preheader: "Confirm your new DealAtlas email address.",
    title: "Confirm your new email",
    paragraphs: [
      "Confirm <strong style=\"color:#0B1F33;\">{{ .NewEmail }}</strong> as the new email address for this DealAtlas account. The link expires shortly and can only be used once.",
    ],
    cta: { href: confirmHref("email_change"), label: "Confirm new email" },
    otpLabel: "Or enter this code in DealAtlas",
  }),
  "recovery.html": layout({
    preheader: "Choose a new DealAtlas password.",
    title: "Reset your password",
    paragraphs: [
      "We received a request to reset the password for this DealAtlas account. Use the button below to choose a new one. The link expires shortly and can only be used once.",
    ],
    cta: { href: confirmHref("recovery"), label: "Choose a new password" },
    otpLabel: "Or enter this code on the reset page",
  }),
  "reauthentication.html": layout({
    preheader: "Your DealAtlas verification code.",
    title: "Verify it is you",
    paragraphs: [
      "Enter this code in DealAtlas to confirm a sensitive change. It expires shortly.",
    ],
    cta: null,
    otpLabel: "Verification code",
  }),
};

for (const [name, html] of Object.entries(templates)) {
  fs.writeFileSync(path.join(dir, name), html);
  process.stdout.write(`wrote ${name} (${html.length} chars)\n`);
}
