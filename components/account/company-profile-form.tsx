"use client";

import { useActionState } from "react";

import { saveCompanyProfileAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { BUYER_SECTOR_LABELS, BUYER_SECTORS } from "@/lib/constants";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";
import { UK_REGION_OPTIONS } from "@/lib/search/filters";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CompanyProfileFields = {
  company_name: string | null;
  company_description: string | null;
  company_size: string | null;
  products_services: string[];
  keywords: string[];
  negative_keywords: string[];
  preferred_regions: string[];
  preferred_category_slugs: string[];
  preferred_cpv_codes: string[];
  certifications: string[];
  framework_memberships: string[];
  preferred_buyer_sectors: string[];
  minimum_deal_value: number | null;
  maximum_deal_value: number | null;
};

function listValue(values: string[] | null | undefined): string {
  return (values ?? []).join("\n");
}

export function CompanyProfileForm({
  companyProfile,
}: {
  companyProfile: CompanyProfileFields | null;
}) {
  const [state, action, pending] = useActionState(
    saveCompanyProfileAction,
    INITIAL_ACTION_STATE,
  );
  const selectedSectors = new Set(companyProfile?.preferred_buyer_sectors ?? []);
  const selectedRegions = new Set(companyProfile?.preferred_regions ?? []);
  const selectedCategories = new Set(companyProfile?.preferred_category_slugs ?? []);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Free accounts can save one matching profile. Saving recalculates relevance
        scores for published opportunities. Join DealAtlas Pro to unlock buyer
        and source details.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company_name">Company name</Label>
        <Input
          id="company_name"
          name="company_name"
          defaultValue={companyProfile?.company_name ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company_description">Company description</Label>
        <Textarea
          id="company_description"
          name="company_description"
          defaultValue={companyProfile?.company_description ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company_size">Company size</Label>
        <Input
          id="company_size"
          name="company_size"
          placeholder="e.g. 10–49 employees"
          defaultValue={companyProfile?.company_size ?? ""}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minimum_deal_value">Minimum deal value (£)</Label>
          <Input
            id="minimum_deal_value"
            name="minimum_deal_value"
            type="number"
            min={0}
            step="1"
            defaultValue={companyProfile?.minimum_deal_value ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maximum_deal_value">Maximum deal value (£)</Label>
          <Input
            id="maximum_deal_value"
            name="maximum_deal_value"
            type="number"
            min={0}
            step="1"
            defaultValue={companyProfile?.maximum_deal_value ?? ""}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Preferred buyer sectors</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {BUYER_SECTORS.map((sector) => (
            <label key={sector} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="preferred_buyer_sectors"
                value={sector}
                defaultChecked={selectedSectors.has(sector)}
              />
              {BUYER_SECTOR_LABELS[sector]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Preferred categories</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEAL_CATEGORY_CATALOG.map((category) => (
            <label key={category.slug} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="preferred_category_slugs"
                value={category.slug}
                defaultChecked={selectedCategories.has(category.slug)}
              />
              {category.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Regions served</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {UK_REGION_OPTIONS.map((region) => (
            <label key={region} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="preferred_regions"
                value={region}
                defaultChecked={selectedRegions.has(region)}
              />
              {region}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="products_services">Products and services</Label>
        <Textarea
          id="products_services"
          name="products_services"
          placeholder="One item per line"
          defaultValue={listValue(companyProfile?.products_services)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="keywords">Keywords</Label>
        <Textarea
          id="keywords"
          name="keywords"
          placeholder="One item per line"
          defaultValue={listValue(companyProfile?.keywords)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="negative_keywords">Negative keywords</Label>
        <Textarea
          id="negative_keywords"
          name="negative_keywords"
          placeholder="One item per line. These reduce poor matches."
          defaultValue={listValue(companyProfile?.negative_keywords)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preferred_cpv_codes">Preferred CPV codes</Label>
        <Textarea
          id="preferred_cpv_codes"
          name="preferred_cpv_codes"
          placeholder="One code per line"
          defaultValue={listValue(companyProfile?.preferred_cpv_codes)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="certifications">Certifications</Label>
        <Textarea
          id="certifications"
          name="certifications"
          placeholder="One item per line"
          defaultValue={listValue(companyProfile?.certifications)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="framework_memberships">Framework memberships</Label>
        <Textarea
          id="framework_memberships"
          name="framework_memberships"
          placeholder="One item per line"
          defaultValue={listValue(companyProfile?.framework_memberships)}
        />
      </div>
      <FormStatus error={state.error} success={state.success} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save company profile"}
        </Button>
      </div>
    </form>
  );
}
