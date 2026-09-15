export function GET() {
  return Response.json({
    ok: true,
    service: "dealatlas",
    time: new Date().toISOString(),
  });
}
