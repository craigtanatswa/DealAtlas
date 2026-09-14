import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAuthUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  const user = await getAuthUser();

  return (
    <AuthCard
      title="Choose a new password"
      description="Use the link from your email, then set a new password for this account."
    >
      <ResetPasswordForm hasSession={Boolean(user)} />
    </AuthCard>
  );
}
