import type { Metadata } from "next";

import { CompanyProfileForm } from "@/components/account/company-profile-form";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Main className="gap-10">
      <PageHeader
        title="Profile"
        description="Manage your account details and the company profile used for matching."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} emailVerified={isEmailVerified(user)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Company profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyProfileForm companyProfile={companyProfile} />
        </CardContent>
      </Card>
    </Main>
  );
}
