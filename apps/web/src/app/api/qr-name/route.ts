import type { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { lookupQrPageName, lookupQrPageMetadata } from "@/lib/qr-name-metadata";
import { handleQrNamePost } from "@/lib/qr-name-route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Only public metadata enters this cache. Authentication stays outside its scope.
const cachedMetadata = unstable_cache(async (code: string) => {
  const metadata = await lookupQrPageMetadata(code);
  if (!metadata || (!metadata.name && !metadata.imageUrl)) throw new Error("Metadata unavailable");
  return metadata;
}, ["qr-public-metadata-v1"], { revalidate: 3600 });

export async function POST(request: NextRequest) {
  return handleQrNamePost(request, {
    createClient,
    lookupName: lookupQrPageName,
    lookupMetadata: cachedMetadata,
  });
}
