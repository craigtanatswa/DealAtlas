import "server-only";

import { Resend } from "resend";

import { getServerEnv } from "@/lib/env/server";
import type { EmailMessage, EmailSendResult, EmailSender } from "@/lib/email/render";

export type { EmailMessage, EmailSendResult, EmailSender } from "@/lib/email/render";
export { renderAlertDigest } from "@/lib/email/render";

const DEFAULT_FROM = "DealAtlas <alerts@localhost>";

export function createEmailSender(options?: {
  apiKey?: string | null;
  from?: string;
}): EmailSender {
  const env = options && "apiKey" in options ? null : getServerEnv();
  const apiKey =
    options && "apiKey" in options ? (options.apiKey ?? null) : (env?.RESEND_API_KEY ?? null);
  const from =
    options?.from ?? env?.DEALATLAS_EMAIL_FROM ?? DEFAULT_FROM;

  if (!apiKey) {
    return {
      async send(message) {
        console.info("DealAtlas email skipped (no RESEND_API_KEY)", {
          to: message.to,
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
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return { id: result.data?.id ?? null, skipped: false };
    },
  };
}
