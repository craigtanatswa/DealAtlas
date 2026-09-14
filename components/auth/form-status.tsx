export function FormStatus({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (success) {
    return (
      <p role="status" className="text-sm text-foreground">
        {success}
      </p>
    );
  }

  return null;
}
