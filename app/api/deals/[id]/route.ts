export async function GET() {
  return Response.json(
    {
      error:
        "Protected deal data is not available without a verified Pro subscription.",
    },
    { status: 401 },
  );
}
