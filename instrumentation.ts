export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { registerNodeInstrumentation } = await import(
    "./instrumentation.node"
  );
  await registerNodeInstrumentation();
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: Record<string, unknown>,
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { reportRequestError } = await import("./instrumentation.node");
  await reportRequestError(error, request, context);
}
