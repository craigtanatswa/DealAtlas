import { getPublicEnv } from "@/lib/env/public";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function originFrom(appUrl: string): string {
  return appUrl.replace(/\/$/, "");
}

export function renderAlertConfirmationEmail(input: {
  appUrl?: string;
  confirmUrl: string;
  categoryName?: string | null;
}): { subject: string; text: string; html: string } {
  const origin = originFrom(input.appUrl ?? getPublicEnv().NEXT_PUBLIC_APP_URL);
  const category =
    input.categoryName && input.categoryName.trim()
      ? input.categoryName.trim()
      : null;
  const subject = category
    ? `Confirm your DealAtlas alerts for ${category}`
    : "Confirm your DealAtlas opportunity alerts";
  const intro = category
    ? `Confirm your email to get alerts about new ${category} opportunities on DealAtlas.`
    : "Confirm your email to get alerts about new opportunities on DealAtlas.";
  const text = [
    intro,
    "",
    `Confirm: ${input.confirmUrl}`,
    "",
    "This link expires in 48 hours. If you did not request alerts, you can ignore this email.",
    origin,
  ].join("\n");
  const html = `
    <p>${escapeHtml(intro)}</p>
    <p><a href="${escapeHtml(input.confirmUrl)}">Confirm email alerts</a></p>
    <p>This link expires in 48 hours. If you did not request alerts, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}
