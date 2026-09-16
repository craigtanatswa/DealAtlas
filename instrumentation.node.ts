export async function registerNodeInstrumentation() {
  const { getPublicEnv } = await import("@/lib/env/public");
  const { getServerEnv } = await import("@/lib/env/server");
  getPublicEnv();
  getServerEnv();

  const { createErrorReporter } = await import("@/lib/monitoring");
  const reporter = createErrorReporter();
  process.on("unhandledRejection", (reason) => {
    void reporter.captureException(reason, {
      job: "web",
      kind: "unhandledRejection",
    });
  });
  process.on("uncaughtException", (error) => {
    void reporter.captureException(error, {
      job: "web",
      kind: "uncaughtException",
    });
  });
}

export async function reportRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: Record<string, unknown>,
) {
  const { createErrorReporter } = await import("@/lib/monitoring");
  const reporter = createErrorReporter();
  await reporter.captureException(error, {
    job: "web",
    kind: "onRequestError",
    path: request.path,
    method: request.method,
    ...context,
  });
}
