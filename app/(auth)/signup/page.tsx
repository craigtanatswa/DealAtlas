import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { parseCheckoutPlan, resolveNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Get started",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const nextPath = resolveNextPath(params.next);
  const plan = parseCheckoutPlan(params.plan);

  return (
    <AuthCard
      title="Create your account"
      description="Sign up with Google, or with email and password. Email sign-up sends a verification link when confirmation is enabled."
    >
      <SignupForm nextPath={nextPath} plan={plan} />
    </AuthCard>
  );
}
