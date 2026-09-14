export class IngestionError extends Error {
  readonly stage: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(options: {
    message: string;
    stage: string;
    code?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "IngestionError";
    this.stage = options.stage;
    this.code = options.code ?? "INGESTION_ERROR";
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
}

export class ComplianceError extends IngestionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      message,
      stage: "compliance",
      code: "SOURCE_COMPLIANCE_BLOCKED",
      retryable: false,
      details,
    });
    this.name = "ComplianceError";
  }
}

export function asIngestionError(
  error: unknown,
  stage: string,
  fallbackCode = "UNEXPECTED",
): IngestionError {
  if (error instanceof IngestionError) {
    return error;
  }

  if (error instanceof Error) {
    return new IngestionError({
      message: error.message,
      stage,
      code: fallbackCode,
      retryable: false,
    });
  }

  return new IngestionError({
    message: String(error),
    stage,
    code: fallbackCode,
    retryable: false,
  });
}
