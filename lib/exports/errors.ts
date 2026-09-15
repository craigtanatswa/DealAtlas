export class ExportQuotaError extends Error {
  readonly code = "EXPORT_LIMIT";

  constructor(message = "This workspace has used its export allowance for the current period.") {
    super(message);
    this.name = "ExportQuotaError";
  }
}

export const EXPORT_ERROR = {
  UNAUTHENTICATED: "Sign in to export opportunities.",
  FORBIDDEN: "Export is available on DealAtlas Pro.",
  INVALID_INPUT: "Choose a filtered result set or selected deals to export.",
  EMPTY: "No matching opportunities are available to export.",
  LIMIT: "This workspace has used its export allowance for the current period.",
  TOO_LARGE:
    "This export would exceed the remaining monthly allowance. Narrow the selection and try again.",
} as const;
