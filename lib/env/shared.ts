const PUBLIC_SECRET_PATTERN =
  /SECRET|SERVICE_ROLE|SERVICE_KEY|PRIVATE_KEY|WEBHOOK_KEY/i;

export function blankToUndefined(
  value: string | undefined | null,
): string | undefined {
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function pickEnv(
  env: Record<string, string | undefined>,
  keys: readonly string[],
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const key of keys) {
    result[key] = blankToUndefined(env[key]);
  }

  return result;
}

export function assertPublicEnvHasNoSecrets(
  env: Record<string, string | undefined> = process.env,
): void {
  const leaked = Object.keys(env).filter(
    (key) => key.startsWith("NEXT_PUBLIC_") && PUBLIC_SECRET_PATTERN.test(key),
  );

  if (leaked.length > 0) {
    throw new Error(
      `Server secrets must not be exposed as NEXT_PUBLIC_ variables: ${leaked.join(", ")}`,
    );
  }
}

export function formatEnvError(label: string, prettyError: string): Error {
  return new Error(`${label} environment is invalid.\n${prettyError}`);
}
