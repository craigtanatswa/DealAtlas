import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { emailSchema } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Verify email",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const parsed = emailSchema.safeParse(params.email);
  const email = parsed.success ? parsed.data : "";

  return (
    <AuthCard
      title="Check your email"
      description="If this project requires email confirmation, open the link we sent you. You can request another link below."
    >
      <VerifyEmailForm email={email} />
    </AuthCard>
  );
}
