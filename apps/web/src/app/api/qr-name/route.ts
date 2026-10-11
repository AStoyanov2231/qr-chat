import type { NextRequest } from "next/server";
import { resolveGroup } from "@/lib/group-metadata";
import { handleQrNamePost } from "@/lib/qr-name-route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleQrNamePost(request, { createClient, resolveGroup });
}
