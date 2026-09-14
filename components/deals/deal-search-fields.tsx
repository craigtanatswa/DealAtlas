import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  BUYER_SECTOR_OPTIONS,
  DEAL_CATEGORY_OPTIONS,
  DEAL_STATUS_OPTIONS,
  DEAL_TYPE_OPTIONS,
  DEADLINE_BAND_OPTIONS,
  UK_REGION_OPTIONS,
  VALUE_BAND_OPTIONS,
} from "@/lib/search/filters";
import type { PublicSearchFilters } from "@/lib/search/params";

export function DealKeywordFields({
  filters,
  idPrefix,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
}) {
  const keywordId = `${idPrefix}-q`;

  return (
    <Field
      id={keywordId}
      label="Keyword"
      hint="Search DealAtlas titles and summaries only."
    >
      <Input
        id={keywordId}
        name="q"
        type="search"
        defaultValue={filters.query ?? ""}
        placeholder="Search opportunities"
        maxLength={200}
        autoComplete="off"
      />
    </Field>
  );
}

export function DealFilterSelects({
  filters,
  idPrefix,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4">
      <Field id={`${idPrefix}-category`} label="Category">
        <NativeSelect
          id={`${idPrefix}-category`}
          name="category"
          defaultValue={filters.category ?? ""}
        >
          <option value="">Any category</option>
          {DEAL_CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-buyerSector`} label="Buyer sector">
        <NativeSelect
          id={`${idPrefix}-buyerSector`}
          name="buyerSector"
          defaultValue={filters.buyerSector ?? ""}
        >
          <option value="">Any sector</option>
          {BUYER_SECTOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-region`} label="Region">
        <NativeSelect
          id={`${idPrefix}-region`}
          name="region"
          defaultValue={filters.region ?? ""}
        >
          <option value="">Any region</option>
          {UK_REGION_OPTIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-valueBand`} label="Value band">
        <NativeSelect
          id={`${idPrefix}-valueBand`}
          name="valueBand"
          defaultValue={filters.valueBand ?? ""}
        >
          <option value="">Any value</option>
          {VALUE_BAND_OPTIONS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-deadlineBand`} label="Closing window">
        <NativeSelect
          id={`${idPrefix}-deadlineBand`}
          name="deadlineBand"
          defaultValue={filters.deadlineBand ?? ""}
        >
          <option value="">Any closing window</option>
          {DEADLINE_BAND_OPTIONS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-dealType`} label="Deal type">
        <NativeSelect
          id={`${idPrefix}-dealType`}
          name="dealType"
          defaultValue={filters.dealType ?? ""}
        >
          <option value="">Any type</option>
          {DEAL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-status`} label="Status">
        <NativeSelect
          id={`${idPrefix}-status`}
          name="status"
          defaultValue={filters.status ?? ""}
        >
          <option value="">Any status</option>
          {DEAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}
