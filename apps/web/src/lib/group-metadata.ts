import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { productGroupName, qrGroupName } from "@qr-chat/domain";
import { qrNameSchema } from "@qr-chat/validation";
import { isPublicAddress, pageMeta } from "./page-meta";

const RETRY_MS = 60 * 60 * 1000;
// Open Food Facts misses are cached this long; transient failures (429, 5xx, timeouts) are never cached.
const NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
// Versioned by GTIN and written once per product, so browsers and the Storage CDN may keep it for a year.
const PRODUCT_IMAGE_CACHE = "31536000";
const OFF_IMAGE = /^https:\/\/images\.openfoodfacts\.org\//u;
// Scanned websites are cached per address: a week when read, an hour when the fetch failed.
const PAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_FAILED_TTL_MS = 60 * 60 * 1000;
const MAX_PAGE_BYTES = 256 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
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

/** GET a public web page or image: http(s) on ports 80/443 only, every redirect hop re-checked, size capped.
 * ponytail: DNS is resolved before fetch() resolves it again, so a rebinding host could slip through; pin the address if that matters. */
async function fetchPublic(target: string, max: number, type: RegExp): Promise<{ url: URL; type: string; data: Buffer; over: boolean } | null> {
  for (let hop = 0; hop < 4; hop++) {
    let url: URL;
    try { url = new URL(target); } catch { return null; }
    if (!/^https?:$/u.test(url.protocol) || url.port) return null;
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length || !addresses.every(({ address }) => isPublicAddress(address))) return null;
    let response: Response;
    try {
      response = await fetch(url, { headers: { "user-agent": `QRChat/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "qr-chat"})` }, redirect: "manual", signal: AbortSignal.timeout(3000) });
    } catch { return null; }
    const next = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && next) { target = new URL(next, url).href; continue; }
    if (!response.ok || !response.body || !type.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); return null; }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
        size += chunk.byteLength;
        if (size > max) { await response.body.cancel(); break; }
      }
    } catch { return null; }
    return { url, type: (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(), data: Buffer.concat(chunks).subarray(0, max), over: size > max };
  }
  return null;
}

/** Title and preview image of a scanned website; either may be missing. Cached per address. */
async function lookupPage(db: Db, code: string): Promise<{ name: string | null; image_path: string | null }> {
  const { data: cached } = await db.from("pages").select("name, image_path, failed, fetched_at").eq("url", code).maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < (cached.failed ? PAGE_FAILED_TTL_MS : PAGE_TTL_MS)) return cached;
  const page = await fetchPublic(code, MAX_PAGE_BYTES, /^text\/html|^application\/xhtml/iu);
  const { title, image } = page ? pageMeta(page.data.toString("utf8")) : { title: null, image: null };
  let image_path: string | null = null;
  if (page && image) {
    const imageUrl = new URL(image, page.url).href;
    const photo = await fetchPublic(imageUrl, MAX_IMAGE_BYTES, /^image\/(?:jpeg|png|webp)$/iu).catch(() => null);
    if (photo && !photo.over && photo.data.length) {
      // One photo per address and source image, shared by every group created from it; a new og:image gets a new path past the year-long cache.
      const path = `u/${createHash("sha256").update(`${code}\n${imageUrl}`).digest("hex")}.${IMAGE_EXT[photo.type]}`;
      const upload = await db.storage.from("group-images").upload(path, photo.data, { contentType: photo.type, cacheControl: PRODUCT_IMAGE_CACHE, upsert: true });
      if (!upload.error) image_path = path;
    }
  }
  const row = { name: qrNameSchema.safeParse(title).data ?? null, image_path };
  await db.from("pages").upsert({ url: code, ...row, failed: !page, fetched_at: new Date().toISOString() });
  return row;
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

  // A website QR takes the page title and og:image, falling back to the name in the address.
  if (!code.startsWith("gtin:")) {
    const page = /^https?:\/\//iu.test(code) ? await lookupPage(db, code) : null;
    const name = page?.name ?? qrGroupName(code);
    return name && nameGroup(db, group.id, name, page?.image_path ?? null);
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
