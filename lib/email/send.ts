import "server-only";

import { Resend } from "resend";

import { getServerEnv } from "@/lib/env/server";
import { getPublicEnv } from "@/lib/env/public";
import { isUnsafeTransactionalFrom } from "@/lib/env/production";
import { structuredLog } from "@/lib/observability/log";
import { renderAlertDigest } from "@/lib/email/render";
import { PLANS } from "@/lib/constants";
import type { EmailMessage, EmailSendResult, EmailSender } from "@/lib/email/render";

export type { EmailMessage, EmailSendResult, EmailSender } from "@/lib/email/render";
export { renderAlertDigest } from "@/lib/email/render";

export function emailProviderConfigured(
  env: {
    RESEND_API_KEY?: string | null;
    DEALATLAS_EMAIL_FROM?: string | null;
  } | null = null,
): boolean {
  const resolved = env ?? getServerEnv();
  return (
    Boolean(resolved.RESEND_API_KEY) &&
    !isUnsafeTransactionalFrom(resolved.DEALATLAS_EMAIL_FROM)
  );
}

export function createEmailSender(options?: {
  apiKey?: string | null;
  from?: string;
}): EmailSender {
  const env = options && "apiKey" in options ? null : getServerEnv();
  const apiKey =
    options && "apiKey" in options ? (options.apiKey ?? null) : (env?.RESEND_API_KEY ?? null);
  const fromAddress = (options?.from ?? env?.DEALATLAS_EMAIL_FROM)?.trim() ?? "";

  if (!apiKey) {
    return {
      async send(message) {
        structuredLog({
          job: "email",
          msg: "email_skipped_unconfigured",
          subject: message.subject,
        });
        return { id: null, skipped: true };
      },
    };
  }

  if (isUnsafeTransactionalFrom(fromAddress)) {
    return {
      async send(message) {
        structuredLog({
          job: "email",
          msg: "email_skipped_unsafe_from",
          subject: message.subject,
        });
        return { id: null, skipped: true };
      },
    };
  }

  const resend = new Resend(apiKey);
  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const result = await resend.emails.send({
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      structuredLog({
        job: "email",
        msg: "email_sent",
        subject: message.subject,
        providerId: result.data?.id ?? null,
      });
      return { id: result.data?.id ?? null, skipped: false };
    },
  };
}

export async function sendAlertProviderTest(input: {
  to: string;
  sender?: EmailSender;
  appUrl?: string;
}): Promise<EmailSendResult> {
  const sender = input.sender ?? createEmailSender();
  const appUrl = input.appUrl ?? getPublicEnv().NEXT_PUBLIC_APP_URL;
  const rendered = renderAlertDigest({
    plan: PLANS.FREE,
    alerts: [
      {
        id: "test",
        alertType: "NEW_MATCH",
        status: "UNREAD",
        title: "DealAtlas email provider test",
        message: "This is a sanitised test digest from the DealAtlas jobs runner.",
        createdAt: new Date().toISOString(),
        readAt: null,
        href: "/app/alerts",
        dealId: null,
        previewTitle: "Sanitised opportunity preview for email delivery test",
      },
    ],
    appUrl,
  });
  return sender.send({
    to: input.to,
    subject: `DealAtlas test: ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
  });
}
