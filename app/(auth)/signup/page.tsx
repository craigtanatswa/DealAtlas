import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Get started",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeRedirectPath(params.next);

  return (
    <AuthCard
      title="Create your account"
      description="Sign up with email and password. We will send a verification link when email confirmation is enabled."
    >
      <SignupForm nextPath={nextPath} />
    </AuthCard>
  );
}
