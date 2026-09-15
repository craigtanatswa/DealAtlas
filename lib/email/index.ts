/**
 * Resend-compatible transactional/alert email abstraction.
 * Billing emails remain Dodo-owned.
 *
 * Rendering is importable from tests. Delivery (`createEmailSender`) is server-only.
 */
export {
  renderAlertDigest,
  type EmailMessage,
  type EmailSendResult,
  type EmailSender,
} from "@/lib/email/render";
