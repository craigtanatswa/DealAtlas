import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { messageFromAuthQueryError } from "@/lib/auth/messages";
import { parseCheckoutPlan, sanitizeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeRedirectPath(params.next);
  const plan = parseCheckoutPlan(params.plan);
  const initialError = messageFromAuthQueryError(params.error);

  return (
    <AuthCard
      title="Sign in"
      description="Sign in with Google, or use the email and password for your DealAtlas workspace."
    >
      <LoginForm nextPath={nextPath} plan={plan} initialError={initialError} />
    </AuthCard>
  );
}
