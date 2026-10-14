import type { NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { authenticatedUserId } from "@/lib/qr-name-route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Erases the caller's account: sent messages, avatar files, then the auth user (profile, friendships and blocks cascade). */
export async function DELETE(request: NextRequest) {
  const userId = await authenticatedUserId(request, createClient);
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = createAdmin<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const erased = await db.rpc("erase_user_messages", { p_user_id: userId });
    if (erased.error) throw erased.error;
    const { data: files } = await db.storage.from("avatars").list(userId);
    if (files?.length) await db.storage.from("avatars").remove(files.map(({ name }) => `${userId}/${name}`));
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (error) {
    console.error("Account deletion failed", error);
    return Response.json({ error: "Could not delete the account" }, { status: 500 });
  }
  return Response.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
