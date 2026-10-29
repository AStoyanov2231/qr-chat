import type { NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { authenticatedUserId } from "@/lib/qr-name-route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Every bucket whose objects live under the owner's `<userId>/` folder. */
const USER_BUCKETS = ["avatars", "venue-menus", "venue-photos"];

/**
 * Erases the caller's account: files, sent messages, then the auth user (profile, places, friendships and blocks cascade).
 * Storage and the database can't share a transaction, so every step is idempotent and the auth user goes last:
 * if any step fails the account still exists, the caller is still signed in, and deleting again finishes the job.
 * Deleting the user first would instead strand public files with no owner and no way to retry.
 */
export async function DELETE(request: NextRequest) {
  const userId = await authenticatedUserId(request, createClient);
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = createAdmin<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    for (const bucket of USER_BUCKETS) {
      // list() returns at most `limit` files and remove() takes at most 1000 paths; listing from the start again sees what is left.
      for (;;) {
        const { data, error } = await db.storage.from(bucket).list(userId, { limit: 1000 });
        if (error) throw error;
        if (data.length) {
          const removed = await db.storage.from(bucket).remove(data.map(({ name }) => `${userId}/${name}`));
          if (removed.error) throw removed.error;
        }
        if (data.length < 1000) break;
      }
    }
    const erased = await db.rpc("erase_user_messages", { p_user_id: userId });
    if (erased.error) throw erased.error;
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (error) {
    console.error("Account deletion failed", error);
    return Response.json({ error: "Could not delete the account" }, { status: 500 });
  }
  return Response.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
