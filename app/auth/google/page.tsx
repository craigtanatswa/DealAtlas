import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleAuthReturn } from "@/components/auth/google-auth-return";
import { NOINDEX_ROBOTS } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Signing in",
  robots: NOINDEX_ROBOTS,
};

export default function GoogleAuthPage() {
  return (
    <AuthCard
      title="Signing in"
      description="Completing Google sign-in with your DealAtlas account."
    >
      <GoogleAuthReturn />
    </AuthCard>
  );
}
