import type { Metadata } from "next";

import { CompanyProfileForm } from "@/components/account/company-profile-form";
import { ProfileForm } from "@/components/account/profile-form";
import { isEmailVerified, requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Profile",
};

const COMPANY_PROFILE_COLUMNS =
  "company_name, company_description, company_size, products_services, keywords, negative_keywords, preferred_regions, preferred_category_slugs, preferred_cpv_codes, certifications, framework_memberships, preferred_buyer_sectors, minimum_deal_value, maximum_deal_value";

export default async function ProfilePage() {
  const { user, profile } = await requireUser("/app/profile");
  const supabase = await createSupabaseServerClient();
  const { data: companyProfile } = await supabase
    .from("company_profiles")
    .select(COMPANY_PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Manage your account details and the company profile used for matching.
        </p>
      </div>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>
        <div className="mt-4">
          <ProfileForm profile={profile} emailVerified={isEmailVerified(user)} />
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">Company profile</h2>
        <div className="mt-4">
          <CompanyProfileForm companyProfile={companyProfile} />
        </div>
      </section>
    </main>
  );
}
