import type { NextRequest } from "next/server";
import { lookupQrPageName } from "@/lib/qr-name-metadata";
import { handleQrNamePost } from "@/lib/qr-name-route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleQrNamePost(request, {
    createClient,
    lookupName: lookupQrPageName,
  });
}
