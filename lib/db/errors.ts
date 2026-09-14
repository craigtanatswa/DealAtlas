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
