export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { createErrorReporter } = await import("@/lib/monitoring");
  const reporter = createErrorReporter();
  process.on("unhandledRejection", (reason) => {
    void reporter.captureException(reason, { job: "web", kind: "unhandledRejection" });
  });
  process.on("uncaughtException", (error) => {
    void reporter.captureException(error, { job: "web", kind: "uncaughtException" });
  });
}
