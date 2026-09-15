export const ADMIN_ERROR = {
  UNAUTHENTICATED: "Sign in with an administrator account to continue.",
  FORBIDDEN: "Administrator access is required.",
  INVALID_INPUT: "That admin request was not valid.",
  SOURCE_ENABLE_BLOCKED: "This source cannot be enabled with the current compliance gates.",
  PREVIEW_NOT_LOW: "Only LOW-risk previews can be published.",
  PREVIEW_HELD: "This preview is held unpublished by an administrator.",
  MERGE_SAME_ORG: "Choose two different organisations to merge.",
} as const;

export class AdminAccessError extends Error {
  readonly code: keyof typeof ADMIN_ERROR;

  constructor(code: keyof typeof ADMIN_ERROR, message?: string) {
    super(message ?? ADMIN_ERROR[code]);
    this.name = "AdminAccessError";
    this.code = code;
  }
}

export class AdminMutationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminMutationError";
    this.code = code;
  }
}
