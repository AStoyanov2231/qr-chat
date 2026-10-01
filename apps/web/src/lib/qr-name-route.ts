import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { qrNameLookupRequestSchema, qrNameLookupResponseSchema } from "@qr-chat/validation";

export const QR_NAME_API_PATH = "/api/qr-name";

export function isRouteAuthenticatedApiPath(pathname: string): boolean {
  return pathname === QR_NAME_API_PATH;
}

type Dependencies = {
  createClient: () => Promise<Pick<SupabaseClient<Database>, "auth">>;
  lookupName: (code: string) => Promise<string | null>;
};

async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function isAuthenticated(request: Request, createClient: Dependencies["createClient"]): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  let bearer: string | undefined;
  if (authorization !== null) {
    const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
    if (!match) return false;
    bearer = match[1];
  }
  try {
    const client = await createClient();
    const { data, error } = bearer
      ? await client.auth.getUser(bearer)
      : await client.auth.getUser();
    return !error && !!data.user;
  } catch {
    return false;
  }
}

/** Route core separated from Next so cookie and bearer auth behavior is unit-testable. */
export async function handleQrNamePost(request: Request, dependencies: Dependencies): Promise<Response> {
  if (!(await isAuthenticated(request, dependencies.createClient))) return json({ error: "Authentication required" }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Expected a JSON request" }, 415);
  }
  const bodyText = await readBoundedBody(request, 4096);
  if (bodyText === null) return json({ error: "Request body is too large or invalid" }, 400);
  let value: unknown;
  try { value = JSON.parse(bodyText) as unknown; } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = qrNameLookupRequestSchema.safeParse(value);
  if (!parsed.success) return json({ error: "Invalid QR code" }, 400);

  let name: string | null = null;
  try { name = await dependencies.lookupName(parsed.data.code); } catch { /* lookup failure asks the participant to name it */ }
  const response = qrNameLookupResponseSchema.safeParse({ name });
  return json({ name: response.success ? response.data.name : null });
}
