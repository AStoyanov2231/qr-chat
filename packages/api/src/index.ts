import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@qr-chat/types";
import { codeKeySchema, qrNameSchema, profileSchema, userIdSchema, messageBodySchema, pageSchema } from "@qr-chat/validation";
export { watchChanges } from "./realtime.ts";
export type { ConnectionState, ChangeFilter } from "./realtime.ts";
export type { Database, Tables } from "@qr-chat/types";

export class ChatApiError extends Error {
  readonly code: string;
  constructor(message: string, code = "UNKNOWN") {
    super(message);
    this.name = "ChatApiError";
    this.code = code;
  }
}

async function nullableResult<T>(request: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new ChatApiError(error.message, error.code);
  return data;
}

async function result<T>(request: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<NonNullable<T>> {
  const data = await nullableResult(request);
  if (data === null || data === undefined) throw new ChatApiError("The requested data is no longer available.", "NOT_AVAILABLE");
  return data;
}

/** Inject an authenticated public client. Storage and auth lifecycle belong to the host platform. */
export function createChatApi(client: SupabaseClient<Database>) {
  async function userId() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
    return data.user.id;
  }
  return {
    client,
    userId,
    async profile(): Promise<Tables<"profiles"> | null> {
      return nullableResult(client.from("profiles").select("*").eq("id", await userId()).maybeSingle());
    },
    async saveProfile(input: unknown) {
      const profile = profileSchema.parse(input);
      const id = await userId();
      // Column-level grants intentionally disallow updating the primary key via upsert.
      const existing = await nullableResult(client.from("profiles").select("id").eq("id", id).maybeSingle());
      if (!existing) {
        const inserted = await client.from("profiles").insert({ id, ...profile }).select().single();
        if (!inserted.error) return inserted.data;
        if (inserted.error.code !== "23505") throw new ChatApiError(inserted.error.message, inserted.error.code);
      }
      return result(client.from("profiles").update(profile).eq("id", id).select().single());
    },
    async joinGroup(code: unknown, name?: unknown) {
      const data = await result(client.rpc("join_qr_group", {
        p_code_key: codeKeySchema.parse(code),
        ...(name === undefined ? {} : { p_display_name: qrNameSchema.parse(name) }),
      }));
      if (!data[0]) throw new ChatApiError("Unable to join this room.");
      return data[0];
    },
    leaveGroup: () => nullableResult(client.rpc("leave_qr_group")),
    async currentMembership() {
      return nullableResult(client.from("group_memberships")
        .select("*, qr_groups(*, qr_codes(*))").eq("user_id", await userId()).maybeSingle());
    },
    members(groupId: string) {
      return result(client.from("group_memberships").select("*, profiles(*)")
        .eq("group_id", userIdSchema.parse(groupId)).order("joined_at"));
    },
    async groupMessages(groupId: string, options: { before?: number; limit?: number } = {}) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("group_messages").select("*, profiles(display_name)")
        .eq("group_id", userIdSchema.parse(groupId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      const rows = await result(query);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async sendGroupMessage(groupId: string, body: unknown) {
      const group_id = userIdSchema.parse(groupId);
      const content = messageBodySchema.parse(body);
      return result(client.from("group_messages").insert({ group_id, body: content, sender_id: await userId() }).select().single());
    },
    async friends() {
      const id = await userId();
      return result(client.from("friend_connections")
        .select("*, user_a:profiles!friend_connections_user_a_id_fkey(*), user_b:profiles!friend_connections_user_b_id_fkey(*)")
        .or(`user_a_id.eq.${id},user_b_id.eq.${id}`).order("requested_at", { ascending: false }));
    },
    requestFriend: (receiverId: string) => result(client.rpc("send_friend_request", { p_receiver_id: userIdSchema.parse(receiverId) })),
    async acceptFriend(connectionId: string) {
      const accepted = await result(client.rpc("accept_friend_request", { p_connection_id: userIdSchema.parse(connectionId) }));
      if (!accepted) throw new ChatApiError("This request is no longer available.", "NOT_AVAILABLE");
    },
    async removeFriend(connectionId: string) {
      const removed = await result(client.rpc("remove_friend_connection", { p_connection_id: userIdSchema.parse(connectionId) }));
      if (!removed) throw new ChatApiError("This connection is no longer available.", "NOT_AVAILABLE");
    },
    async directMessages(connectionId: string, options: { before?: number; limit?: number } = {}) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("direct_messages").select("*")
        .eq("friend_connection_id", userIdSchema.parse(connectionId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      const rows = await result(query);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async sendDirectMessage(connectionId: string, body: unknown) {
      const friend_connection_id = userIdSchema.parse(connectionId);
      const content = messageBodySchema.parse(body);
      return result(client.from("direct_messages").insert({ friend_connection_id, body: content, sender_id: await userId() }).select().single());
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new ChatApiError(error.message, "SIGN_OUT_FAILED");
      await client.removeAllChannels();
    },
  };
}
export type ChatApi = ReturnType<typeof createChatApi>;
