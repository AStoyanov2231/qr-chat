import { createClient } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { productGroupName, qrGroupName } from "@qr-chat/domain";
import { qrNameSchema } from "@qr-chat/validation";

const RETRY_MS = 60 * 60 * 1000;
// Open Food Facts misses are cached this long; transient failures (429, 5xx, timeouts) are never cached.
const NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
// Versioned by GTIN and written once per product, so browsers and the Storage CDN may keep it for a year.
const PRODUCT_IMAGE_CACHE = "31536000";
const OFF_IMAGE = /^https:\/\/images\.openfoodfacts\.org\//u;
type Product = { name: string; image: ArrayBuffer | null } | "missing";
type Db = ReturnType<typeof createClient<Database>>;

/** Product name and 400px front photo from Open Food Facts (ODbL / CC-BY-SA, credited in Settings).
 * Returns "missing" when OFF has no usable product and null when the lookup failed and should be retried. */
async function lookupProduct(gtin: string): Promise<Product | null> {
  // OFF allows ~15 product reads/min per server IP; the products cache means each GTIN is read once.
  const headers = { "user-agent": `QRChat/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "qr-chat"})` };
  // OFF keeps EAN-8 codes unpadded and everything else as GTIN-13.
  const code = gtin.replace(/^00000/u, "");
  let response: Response;
  try {
    response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,product_name_en,brands,image_front_url`,
      { headers, redirect: "error", signal: AbortSignal.timeout(3000) });
  } catch { return null; }
  if (response.status === 404) return "missing";
  if (!response.ok) return null;
  const { product = {} } = await response.json() as { product?: { product_name?: string; product_name_en?: string; brands?: string; image_front_url?: string } };
  const name = qrNameSchema.safeParse(productGroupName(product)).data;
  if (!name) return "missing";
  let image: ArrayBuffer | null = null;
  if (product.image_front_url && OFF_IMAGE.test(product.image_front_url)) {
    try {
      const photo = await fetch(product.image_front_url, { headers, redirect: "error", signal: AbortSignal.timeout(3000) });
      const data = photo.ok && photo.headers.get("content-type") === "image/jpeg" ? await photo.arrayBuffer() : null;
      image = data && data.byteLength <= MAX_IMAGE_BYTES ? data : null;
    } catch { /* the name still counts without a photo */ }
  }
  return { name, image };
}

async function nameGroup(db: Db, groupId: string, name: string, image_path: string | null) {
  const saved = await db.from("groups").update({ name, image_path }).eq("id", groupId).is("name", null);
  if (saved.error) throw saved.error;
  return name;
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

  // QR names come from the scanned text alone; no site is fetched.
  if (!code.startsWith("gtin:")) {
    const name = qrGroupName(code);
    return name && nameGroup(db, group.id, name, null);
  }
  // Join accepts any code; only scanner-normalized GTIN-13 keys (@qr-chat/domain) reach OFF, the cache and storage.
  const gtin = code.slice(5);
  if (!/^\d{13}$/u.test(gtin)) return null;
  // A cached product names the group without the hourly claim or an Open Food Facts call.
  const { data: cached } = await db.from("products").select("name, image_path, not_found, fetched_at").eq("gtin", gtin).maybeSingle();
  if (cached?.name) return nameGroup(db, group.id, cached.name, cached.image_path);
  if (cached?.not_found && Date.now() - Date.parse(cached.fetched_at) < NOT_FOUND_TTL_MS) return null;

  // Claim the lookup atomically: at most one per group per hour across server instances.
  const retryBefore = new Date(Date.now() - RETRY_MS).toISOString();
  const { data: claimed } = await db.from("groups").update({ metadata_checked_at: new Date().toISOString() })
    .eq("id", group.id).is("name", null).or(`metadata_checked_at.is.null,metadata_checked_at.lt."${retryBefore}"`).select("id");
  if (!claimed?.length) return null;

  const product = await lookupProduct(gtin);
  if (!product) return null;
  const fetched_at = new Date().toISOString();
  if (product === "missing") {
    await db.from("products").upsert({ gtin, name: null, image_path: null, not_found: true, fetched_at });
    return null;
  }
  // One photo per product, shared by every group created from the same barcode.
  let image_path: string | null = null;
  if (product.image) {
    const path = `p/${gtin}.jpg`;
    const upload = await db.storage.from("group-images").upload(path, product.image, { contentType: "image/jpeg", cacheControl: PRODUCT_IMAGE_CACHE, upsert: true });
    if (!upload.error) image_path = path;
  }
  await db.from("products").upsert({ gtin, name: product.name, image_path, not_found: false, fetched_at });
  return nameGroup(db, group.id, product.name, image_path);
}
