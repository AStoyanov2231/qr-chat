// iOS universal links for printed venue QR codes. Served only once APPLE_TEAM_ID is set.
export const dynamic = "force-dynamic";

export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return new Response(null, { status: 404 });
  return Response.json({ applinks: { details: [{ appIDs: [`${team}.com.qrchat.mobile`], components: [{ "/": "/v/*" }] }] } });
}
