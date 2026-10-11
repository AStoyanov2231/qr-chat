import { createClient } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { productGroupName } from "@qr-chat/domain";
import { qrNameSchema } from "@qr-chat/validation";
import { lookupQrPageName } from "@/lib/qr-name-metadata";

const RETRY_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
const OFF_IMAGE = /^https:\/\/images\.openfoodfacts\.org\//u;
type Found = { name: string | null; image: ArrayBuffer | null };

/** Product name and 400px front photo from Open Food Facts (ODbL / CC-BY-SA, credited in Settings). */
async function lookupProduct(gtin: string): Promise<Found> {
  // ponytail: OFF allows ~15 product reads/min per server IP; import their daily dump if new products outgrow it.
  const headers = { "user-agent": `QRChat/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "qr-chat"})` };
  // OFF keeps EAN-8 codes unpadded and everything else as GTIN-13.
  const code = gtin.replace(/^00000/u, "");
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,product_name_en,brands,image_front_url`,
    { headers, redirect: "error", signal: AbortSignal.timeout(3000) });
  if (!response.ok) return { name: null, image: null };
  const { product = {} } = await response.json() as { product?: { product_name?: string; product_name_en?: string; brands?: string; image_front_url?: string } };
  let image: ArrayBuffer | null = null;
  if (product.image_front_url && OFF_IMAGE.test(product.image_front_url)) {
    try {
      const photo = await fetch(product.image_front_url, { headers, redirect: "error", signal: AbortSignal.timeout(3000) });
      const data = photo.ok && photo.headers.get("content-type") === "image/jpeg" ? await photo.arrayBuffer() : null;
      image = data && data.byteLength <= MAX_IMAGE_BYTES ? data : null;
    } catch { /* the name still counts without a photo */ }
  }
  return { name: productGroupName(product), image };
}

/** Server-only writer of group names and photos; clients can never set them. */
export async function resolveGroup(userId: string, code: string): Promise<string | null> {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membership, error } = await db.from("group_members")
    .select("expires_at, groups!inner(id, name)").eq("user_id", userId).eq("groups.code_key", code).maybeSingle();
  if (error) throw error;
  const group = membership?.groups;
  if (!membership || !group || Date.parse(membership.expires_at as string) <= Date.now()) return null;
  if (group.name) return group.name;

  // Claim the lookup atomically: at most one per group per hour across server instances.
  const retryBefore = new Date(Date.now() - RETRY_MS).toISOString();
  const { data: claimed } = await db.from("groups").update({ metadata_checked_at: new Date().toISOString() })
    .eq("id", group.id).is("name", null).or(`metadata_checked_at.is.null,metadata_checked_at.lt."${retryBefore}"`).select("id");
  if (!claimed?.length) return null;

  const found: Found = code.startsWith("gtin:") ? await lookupProduct(code.slice(5)) : { name: await lookupQrPageName(code), image: null };
  const name = qrNameSchema.safeParse(found.name).data ?? null;
  if (!name) return null;
  let image_path: string | null = null;
  if (found.image) {
    const path = `${group.id}.jpg`;
    const upload = await db.storage.from("group-images").upload(path, found.image, { contentType: "image/jpeg", upsert: true });
    if (!upload.error) image_path = path;
  }
  const saved = await db.from("groups").update({ name, image_path }).eq("id", group.id).is("name", null);
  if (saved.error) throw saved.error;
  return name;
}
