// Health check (§114) — usado por uptime monitor e smoke do deploy.
export async function GET() {
  return Response.json({
    status: "ok",
    service: "mici-api",
    timestamp: new Date().toISOString(),
  });
}
