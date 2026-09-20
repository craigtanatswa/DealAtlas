import { PLANS, type Plan } from "@/lib/constants";
import { appDealPath } from "@/lib/deals/paths";
import { safeHttpUrl } from "@/lib/deals/urls";
import type { AlertDto } from "@/lib/alerts/types";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailSendResult = {
  id: string | null;
  skipped: boolean;
};

export type EmailSender = {
  send(message: EmailMessage): Promise<EmailSendResult>;
};

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

function absoluteHref(appUrl: string, href: string): string {
  const origin = originFrom(appUrl);
  if (href.startsWith("/") && !href.startsWith("//")) {
    return `${origin}${href}`;
  }
  return safeHttpUrl(href) ?? `${origin}/app/alerts`;
}

function safeExternalHref(value: string | null | undefined): string | null {
  return safeHttpUrl(value);
}

function brandEmailHeader(origin: string): string {
  const src = escapeHtml(`${origin}/brand/dealatlas-logo.png`);
  return `<p><img src="${src}" alt="DealAtlas" width="180" height="60" /></p>`;
}

export function renderAlertDigest(input: {
  plan: Plan;
  alerts: AlertDto[];
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const count = input.alerts.length;
  const origin = originFrom(input.appUrl);
  if (input.plan !== PLANS.PRO) {
    const previewLines = input.alerts
      .map((alert) => alert.previewTitle)
      .filter((title): title is string => Boolean(title))
      .slice(0, 8);
    const subject =
      count === 1
        ? "A new matching opportunity is available in DealAtlas"
        : `${count} matching opportunities are waiting in DealAtlas`;
    const text = [
      count === 1
        ? "A new matching opportunity is available in DealAtlas."
        : `${count} matching opportunities are available in DealAtlas.`,
      ...previewLines.map((title) => `- ${title}`),
      "Sign in to review sanitised previews. Buyer identity, original titles, and source links stay locked on Free.",
      `${origin}/app/alerts`,
    ].join("\n");
    const htmlItems = previewLines
      .map((title) => `<li>${escapeHtml(title)}</li>`)
      .join("");
    const html = `
      ${brandEmailHeader(origin)}
      <p>${count === 1 ? "A new matching opportunity is available in DealAtlas." : `${count} matching opportunities are available in DealAtlas.`}</p>
      ${htmlItems ? `<ul>${htmlItems}</ul>` : ""}
      <p>Sign in to review sanitised previews. Buyer identity, original titles, and source links stay locked on Free.</p>
      <p><a href="${escapeHtml(`${origin}/app/alerts`)}">Open alert centre</a></p>
    `.trim();
    return { subject, text, html };
  }

  const subject =
    count === 1
      ? `DealAtlas alert: ${input.alerts[0]?.title ?? "Opportunity update"}`
      : `DealAtlas alerts: ${count} updates`;
  const text = input.alerts
    .map((alert) => {
      const href = absoluteHref(input.appUrl, alert.href || appDealPath(alert.dealId ?? ""));
      const lines = [alert.title, alert.message];
      if (alert.buyerName) {
        lines.push(`Buyer: ${alert.buyerName}`);
      }
      if (alert.exactDeadline) {
        lines.push(`Deadline: ${alert.exactDeadline}`);
      }
      const sourceUrl = safeExternalHref(alert.sourceUrl);
      if (sourceUrl) {
        lines.push(`Source: ${sourceUrl}`);
      }
      lines.push(`Open: ${href}`);
      return lines.join("\n");
    })
    .concat([`${origin}/app/alerts`])
    .join("\n\n");

  const html = input.alerts
    .map((alert) => {
      const href = absoluteHref(input.appUrl, alert.href || "/app/alerts");
      const sourceUrl = safeExternalHref(alert.sourceUrl);
      const applicationUrl = safeExternalHref(alert.applicationUrl);
      const extras = [
        alert.buyerName ? `<p>Buyer: ${escapeHtml(alert.buyerName)}</p>` : "",
        alert.exactDeadline
          ? `<p>Deadline: ${escapeHtml(alert.exactDeadline)}</p>`
          : "",
        sourceUrl
          ? `<p><a href="${escapeHtml(sourceUrl)}">Open source notice</a></p>`
          : "",
        applicationUrl
          ? `<p><a href="${escapeHtml(applicationUrl)}">Open application</a></p>`
          : "",
      ].join("");
      return `
        <article>
          <h2>${escapeHtml(alert.title)}</h2>
          <p>${escapeHtml(alert.message)}</p>
          ${extras}
          <p><a href="${escapeHtml(href)}">Open in DealAtlas</a></p>
        </article>
      `;
    })
    .join("");

  return {
    subject,
    text,
    html: `${brandEmailHeader(origin)}${html}<p><a href="${escapeHtml(`${origin}/app/alerts`)}">Alert centre</a></p>`,
  };
}
