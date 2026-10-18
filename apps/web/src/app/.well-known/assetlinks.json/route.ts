// Android app links for printed venue QR codes. Served only once ANDROID_CERT_SHA256 is set (comma-separated).
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = process.env.ANDROID_CERT_SHA256?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!fingerprints?.length) return new Response(null, { status: 404 });
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.qrchat.mobile", sha256_cert_fingerprints: fingerprints },
  }]);
}
