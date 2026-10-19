import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  BUYER_SECTOR_OPTIONS,
  DEAL_CATEGORY_OPTIONS,
  DEAL_STATUS_OPTIONS,
  DEAL_TYPE_OPTIONS,
  DEADLINE_BAND_OPTIONS,
  PUBLIC_STATUS_FILTERS,
  UK_REGION_OPTIONS,
  VALUE_BAND_OPTIONS,
} from "@/lib/search/filters";
import type { PublicSearchFilters } from "@/lib/search/params";

export function DealRelevanceFields({
  filters,
  idPrefix,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4">
      <Field
        id={`${idPrefix}-sort`}
        label="Sort"
        hint="Relevance uses your company profile. Source identity is not used."
      >
        <NativeSelect
          id={`${idPrefix}-sort`}
          name="sort"
          defaultValue={filters.sort ?? "updated"}
        >
          <option value="biddable">Biddable first</option>
          <option value="deadline">Closing date</option>
          <option value="updated">Newest</option>
          <option value="relevance">Relevance</option>
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-minScore`} label="Minimum relevance">
        <NativeSelect
          id={`${idPrefix}-minScore`}
          name="minScore"
          defaultValue={
            filters.minScore != null ? String(filters.minScore) : ""
          }
        >
          <option value="">Any score</option>
          <option value="40">40+</option>
          <option value="60">60+</option>
          <option value="75">75+</option>
        </NativeSelect>
      </Field>
    </div>
  );
}

export function DealKeywordFields({
  filters,
  idPrefix,
  label = "Keyword",
  hint,
  placeholder = "Search opportunities",
  inputClassName,
  labelClassName,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const keywordId = `${idPrefix}-q`;

  return (
    <Field
      id={keywordId}
      label={label}
      hint={hint}
      className="min-w-0 flex-1"
      labelClassName={labelClassName}
    >
      <Input
        id={keywordId}
        name="q"
        type="search"
        defaultValue={filters.query ?? ""}
        placeholder={placeholder}
        maxLength={200}
        autoComplete="off"
        className={inputClassName}
      />
    </Field>
  );
}

export function DealSortSelect({
  filters,
  idPrefix,
  showRelevance = false,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
  showRelevance?: boolean;
}) {
  return (
    <Field id={`${idPrefix}-sort`} label="Sort" className="w-36 shrink-0 sm:w-44">
      <NativeSelect
        id={`${idPrefix}-sort`}
        name="sort"
        defaultValue={filters.sort ?? "biddable"}
        className="h-11 min-h-11"
      >
        <option value="biddable">Biddable first</option>
        <option value="deadline">Closing date</option>
        <option value="updated">Newest</option>
        {showRelevance ? <option value="relevance">Relevance</option> : null}
      </NativeSelect>
    </Field>
  );
}

export function DealFilterSelects({
  filters,
  idPrefix,
  publicStatus = false,
  layout = "stack",
  showRelevance = false,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
  publicStatus?: boolean;
  /** `bar` is one row on desktop and keeps Region and Value visible on small screens. */
  layout?: "stack" | "bar";
  showRelevance?: boolean;
}) {
  const compact = layout === "bar";
  const labelClassName = compact ? "sr-only" : undefined;
  const selectClassName = compact ? "h-11 min-h-11 px-2 lg:px-3" : undefined;
  const collapsed = compact ? "hidden lg:flex" : undefined;

  return (
    <div className={compact ? "contents" : "grid gap-4"}>
      <Field id={`${idPrefix}-category`} label="Category" className={collapsed} labelClassName={labelClassName}>
        <NativeSelect
          id={`${idPrefix}-category`}
          name="category"
          defaultValue={filters.category ?? ""}
          className={selectClassName}
        >
          <option value="">Any category</option>
          {DEAL_CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id={`${idPrefix}-buyerSector`}
        label="Buyer sector"
        className={collapsed}
        labelClassName={labelClassName}
      >
        <NativeSelect
          id={`${idPrefix}-buyerSector`}
          name="buyerSector"
          defaultValue={filters.buyerSector ?? ""}
          className={selectClassName}
        >
          <option value="">Any sector</option>
          {BUYER_SECTOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-region`} label="Region" labelClassName={labelClassName}>
        <NativeSelect
          id={`${idPrefix}-region`}
          name="region"
          defaultValue={filters.region ?? ""}
          className={selectClassName}
        >
          <option value="">Any region</option>
          {UK_REGION_OPTIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-valueBand`} label="Value band" labelClassName={labelClassName}>
        <NativeSelect
          id={`${idPrefix}-valueBand`}
          name="valueBand"
          defaultValue={filters.valueBand ?? ""}
          className={selectClassName}
        >
          <option value="">Any value</option>
          {VALUE_BAND_OPTIONS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id={`${idPrefix}-deadlineBand`}
        label="Closing window"
        className={collapsed}
        labelClassName={labelClassName}
      >
        <NativeSelect
          id={`${idPrefix}-deadlineBand`}
          name="deadlineBand"
          defaultValue={filters.deadlineBand ?? ""}
          className={selectClassName}
        >
          <option value="">Any closing window</option>
          {DEADLINE_BAND_OPTIONS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id={`${idPrefix}-dealType`}
        label="Deal type"
        className={collapsed}
        labelClassName={labelClassName}
      >
        <NativeSelect
          id={`${idPrefix}-dealType`}
          name="dealType"
          defaultValue={filters.dealType ?? ""}
          className={selectClassName}
        >
          <option value="">Any type</option>
          {DEAL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-status`} label="Status" className={collapsed} labelClassName={labelClassName}>
        <NativeSelect
          id={`${idPrefix}-status`}
          name="status"
          defaultValue={filters.status ?? ""}
          className={selectClassName}
        >
          <option value="">Any status</option>
          {(publicStatus ? PUBLIC_STATUS_FILTERS : DEAL_STATUS_OPTIONS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {compact && showRelevance ? (
        <Field
          id={`${idPrefix}-minScore`}
          label="Minimum relevance"
          className={collapsed}
          labelClassName={labelClassName}
        >
          <NativeSelect
            id={`${idPrefix}-minScore`}
            name="minScore"
            defaultValue={filters.minScore != null ? String(filters.minScore) : ""}
            className={selectClassName}
          >
            <option value="">Any score</option>
            <option value="40">40+</option>
            <option value="60">60+</option>
            <option value="75">75+</option>
          </NativeSelect>
        </Field>
      ) : null}
    </div>
  );
}
