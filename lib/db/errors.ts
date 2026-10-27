export class DatabaseQueryError extends Error {
  constructor(
    message: string,
    readonly cause?: { message?: string; code?: string; details?: string },
  ) {
    super(message);
    this.name = "DatabaseQueryError";
  }
}

export function throwIfQueryError<T>(
  label: string,
  result: { data: T; error: { message: string; code?: string; details?: string } | null },
): T {
  if (result.error) {
    throw new DatabaseQueryError(`${label}: ${result.error.message}`, result.error);
  }

  return result.data;
}

/**
 * True when an RPC failed because the p_categories parameter/overload is not
 * installed (older migrations). Callers use this to fall back to p_category.
 */
export function isMissingCategoriesParamError(error: unknown): boolean {
  const source =
    error instanceof DatabaseQueryError
      ? error.cause
      : (error as { message?: string; code?: string; details?: string } | null | undefined);
  if (!source) {
    return false;
  }
  if (source.code === "PGRST202") {
    return true;
  }

  const text = `${source.message ?? ""} ${source.details ?? ""}`;
  if (/could not find the function/i.test(text)) {
    return true;
  }
  return (
    /p_categories/i.test(text) &&
    /(schema cache|does not exist|unknown parameter|not find)/i.test(text)
  );
}
