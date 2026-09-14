import { ROLES } from "@/lib/constants";

type AuthMetadata = Record<string, unknown> | undefined;

export function displayNameFromAuthUser(user: {
  user_metadata?: AuthMetadata;
}): string | null {
  const metadata = user.user_metadata ?? {};
  const name = metadata.name ?? metadata.full_name;
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

export function missingProfileInsert(input: {
  id: string;
  email: string;
  displayName?: string | null;
}) {
  return {
    id: input.id,
    email: input.email,
    display_name: input.displayName?.trim() ? input.displayName.trim().slice(0, 80) : null,
    role: ROLES.USER,
  } as const;
}

/**
 * Recovery/insert payload for a missing profiles row.
 * Role is always USER. Metadata.role is ignored on purpose.
 */
export function profileInsertFromAuthUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: AuthMetadata;
}) {
  return missingProfileInsert({
    id: user.id,
    email: user.email ?? "",
    displayName: displayNameFromAuthUser(user),
  });
}
