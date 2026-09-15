/**
 * Client-safe auth helpers. Server session/profile loaders live in
 * `./session` and `./profile` and must not be imported from client components.
 */
export {
  AUTH_CALLBACK_PATH,
  AUTH_CONFIRM_PATH,
  AUTH_HOME_PATH,
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  SIGNUP_PATH,
  VERIFY_EMAIL_PATH,
  defaultPathForAuthType,
  isAdminPath,
  isAuthCallbackPath,
  isAuthEntryPath,
  isProtectedAppPath,
  loginPathWithNext,
  resolveProtectedRouteRedirect,
  sanitizeRedirectPath,
} from "@/lib/auth/redirect";
export { isAdminRole, resolveAppRole } from "@/lib/auth/roles";
export {
  displayNameFromAuthUser,
  missingProfileInsert,
  profileInsertFromAuthUser,
} from "@/lib/auth/profile-insert";
export {
  companyProfileSchema,
  displayNameSchema,
  forgotPasswordSchema,
  loginSchema,
  parseBuyerSectors,
  parseDelimitedList,
  parseAllowedList,
  parseOptionalNumber,
  passwordSchema,
  resetPasswordSchema,
  signupFormSchema,
} from "@/lib/auth/schemas";
export {
  INITIAL_ACTION_STATE,
  mapAuthError,
  messageFromAuthQueryError,
  type ActionState,
} from "@/lib/auth/messages";
export { parseEmailOtpType } from "@/lib/auth/otp";
export type { AppProfile } from "@/lib/auth/types";
