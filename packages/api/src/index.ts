import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@qr-chat/types";
import { codeKeySchema, qrNameLookupResponseSchema, profileSchema, userIdSchema, messageBodySchema, pageSchema, displayNameSchema, avatarUploadSchema } from "@qr-chat/validation";
import type { ChatOverview, ChatAccess, ChatMutation, GroupMessage, Friend, Profile } from "./overview.ts";
export { getChatStore, createChatStore } from "./store.ts";
export { createObservedFetch } from "./requests.ts";
export type { RequestObservation, RequestObserver } from "./requests.ts";
export type { ChatOverview, ChatAccess } from "./overview.ts";
export type AvatarUpload = { uploadId: string; data: ArrayBuffer };
export { watchChanges } from "./realtime.ts";
export type { ConnectionState, ChangeFilter } from "./realtime.ts";
export type { Database, Tables } from "@qr-chat/types";
export { loadChatSnapshot, loadDirectSnapshot, emptySnapshot } from "./snapshot.ts";
export type { ChatSnapshot, DirectPreview } from "./snapshot.ts";

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
  // PT429 is the database rate limit (HTTP 429); its message is already a short user-facing notice.
  if (error) throw new ChatApiError(error.message, error.code === "PT429" ? "RATE_LIMITED" : error.code);
  return data;
}

async function result<T>(request: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<NonNullable<T>> {
  const data = await nullableResult(request);
  if (data === null || data === undefined) throw new ChatApiError("The requested data is no longer available.", "NOT_AVAILABLE");
  return data;
}

/** Inject an authenticated public client. Session storage and auth lifecycle belong to the host platform. */
export function createChatApi(
  client: SupabaseClient<Database>,
  options: { qrNameEndpoint?: string; fetcher?: typeof fetch } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const qrNameEndpoint = options.qrNameEndpoint ?? "/api/qr-name";
  const mutations = new Set<(event: ChatMutation) => void>();
  const emit = (event: ChatMutation) => { for (const listener of mutations) listener(event); };
  // The database stores avatar object paths; URLs are derived here so the host lives in one place.
  function withAvatar<T extends { avatar_path?: string | null }>(profile: T): T & { avatar_url: string | null } {
    return { ...profile, avatar_url: profile.avatar_path ? client.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null };
  }
  const withImage = <T extends { image_path: string | null }>(group: T) =>
    ({ ...group, image_url: group.image_path ? client.storage.from("group-images").getPublicUrl(group.image_path).data.publicUrl : null });
  const withProfiles = <T extends { profiles: { avatar_path?: string | null } | null }>(message: T) => ({ ...message, profiles: message.profiles && withAvatar(message.profiles) });
  const friendView = <T extends { user_a: { avatar_path?: string | null } | null; user_b: { avatar_path?: string | null } | null }>(friend: T) =>
    ({ ...friend, user_a: friend.user_a && withAvatar(friend.user_a), user_b: friend.user_b && withAvatar(friend.user_b) });
  async function userId() {
    // This ID supplies query filters, never authorization. PostgreSQL enforces RLS.
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
    return data.session.user.id;
  }
  const api = {
    client,
    userId,
    onMutation(listener: (event: ChatMutation) => void) { mutations.add(listener); return () => { mutations.delete(listener); }; },
    async overview(signal?: AbortSignal): Promise<ChatOverview> {
      let query = client.rpc("get_chat_overview");
      if (signal) query = query.abortSignal(signal);
      const overview = await result(query) as unknown as ChatOverview;
      return {
        ...overview,
        profile: overview.profile && withAvatar(overview.profile),
        memberships: overview.memberships.map((membership) => ({ ...membership, groups: membership.groups && withImage(membership.groups), members: membership.members.map(withProfiles), preview: membership.preview && withProfiles(membership.preview) })),
        friends: overview.friends.map(friendView),
      };
    },
    async access(signal?: AbortSignal): Promise<ChatAccess> {
      let query = client.rpc("get_chat_access");
      if (signal) query = query.abortSignal(signal);
      return await result(query) as unknown as ChatAccess;
    },
    async profile(): Promise<Profile | null> {
      const profile = await nullableResult(client.from("profiles").select("*").eq("id", await userId()).maybeSingle());
      return profile && withAvatar(profile);
    },
    async saveProfile(input: unknown) {
      const profile = profileSchema.parse(input);
      const id = await userId();
      // Column-level grants intentionally disallow updating the primary key via upsert.
      const existing = await nullableResult(client.from("profiles").select("id").eq("id", id).maybeSingle());
      if (!existing) {
        const inserted = await client.from("profiles").insert({ id, ...profile }).select().single();
        if (!inserted.error) return withAvatar(inserted.data);
        if (inserted.error.code !== "23505") throw new ChatApiError(inserted.error.message, inserted.error.code);
      }
      return withAvatar(await result(client.from("profiles").update(profile).eq("id", id).select().single()));
    },
    /** undefined keeps the current photo; null removes it. Uploads use immutable keys. */
    async saveProfileWithAvatar(name: string, photo?: AvatarUpload | null): Promise<Profile> {
      const display_name = displayNameSchema.parse(name);
      const upload = photo ? avatarUploadSchema.parse(photo) : photo;
      if (upload === undefined) return api.saveProfile({ display_name });
      const id = await userId();
      const previous = await api.profile();
      const bucket = client.storage.from("avatars");
      let avatar_path: string | null = null;
      if (upload) {
        avatar_path = `${id}/${upload.uploadId}.jpg`;
        await result(bucket.upload(avatar_path, upload.data, { contentType: "image/jpeg", cacheControl: "3600", upsert: false }));
      }
      // A failed response can follow a committed write. Retain the upload on failure
      // rather than deleting an image the profile may now reference.
      if (await userId() !== id) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
      const saved = await api.saveProfile({ display_name, avatar_path });
      // profiles_avatar_path_check guarantees a stored path is one of this user's own uploads.
      if (previous?.avatar_path && previous.avatar_path !== avatar_path) {
        // Cleanup failure must not turn a committed profile save into a failed form.
        try { await bucket.remove([previous.avatar_path]); } catch { /* best effort */ }
      }
      return saved;
    },
    async joinGroup(code: unknown) {
      const data = await result(client.rpc("join_qr_group", { p_code_key: codeKeySchema.parse(code) }));
      if (!data[0]) throw new ChatApiError("Unable to join this room.");
      return data[0];
    },
    /** Asks the server to fill a joined group's missing name and photo. Never throws; null means no name yet.
     * A name the caller already knows is returned as is, so named groups never call the endpoint. */
    async resolveGroup(code: unknown, knownName?: string | null): Promise<string | null> {
      if (knownName) return knownName;
      try {
        const { data } = await client.auth.getSession();
        if (!qrNameEndpoint || !data.session) return null;
        const response = await fetcher(qrNameEndpoint, {
          method: "POST", credentials: "same-origin",
          headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
          body: JSON.stringify({ code: codeKeySchema.parse(code) }), signal: AbortSignal.timeout(3500),
        });
        return response.ok ? qrNameLookupResponseSchema.parse(await response.json()).name : null;
      } catch { return null; }
    },
    leaveGroup: (groupId: string) => nullableResult(client.rpc("leave_qr_group", { p_group_id: userIdSchema.parse(groupId) })),
    async memberships() {
      return result(client.from("group_members")
        .select("*, expires_at, groups(*)").eq("user_id", await userId()).order("joined_at", { ascending: false }));
    },
    async members(groupId: string) {
      return (await result(client.from("group_members").select("*, expires_at, profiles(*)")
        .eq("group_id", userIdSchema.parse(groupId)).order("joined_at"))).map(withProfiles);
    },
    async groupMessages(groupId: string, options: { before?: number; limit?: number } = {}, signal?: AbortSignal) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("messages").select("*, profiles(display_name, avatar_path)")
        .eq("group_id", userIdSchema.parse(groupId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      if (signal) query = query.abortSignal(signal);
      const rows = await result(query);
      const items = rows.slice(0, limit).map(withProfiles);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async groupMessageIds(groupId: string, ids: number[], signal?: AbortSignal): Promise<GroupMessage[]> {
      let query = client.from("messages").select("*, profiles(display_name, avatar_path)")
        .eq("group_id", userIdSchema.parse(groupId)).in("id", ids.map((id) => pageSchema.parse({ before: id }).before!));
      if (signal) query = query.abortSignal(signal);
      return (await result(query)).map(withProfiles);
    },
    async directMessageIds(connectionId: string, ids: number[], signal?: AbortSignal) {
      let query = client.from("messages").select("*")
        .eq("group_id", userIdSchema.parse(connectionId)).in("id", ids.map((id) => pageSchema.parse({ before: id }).before!));
      if (signal) query = query.abortSignal(signal);
      return result(query);
    },
    async sendGroupMessage(groupId: string, body: unknown) {
      const group_id = userIdSchema.parse(groupId);
      const content = messageBodySchema.parse(body);
      const id = await userId();
      const message = withProfiles(await result(client.from("messages").insert({ group_id, body: content, sender_id: id }).select("*, profiles(display_name, avatar_path)").single()));
      emit({ kind: "group", userId: id, message });
      return message;
    },
    async friends(): Promise<Friend[]> {
      const id = await userId();
      return (await result(client.from("friendships")
        .select("*, user_a:profiles!friendships_user_a_id_fkey(*), user_b:profiles!friendships_user_b_id_fkey(*)")
        .or(`user_a_id.eq.${id},user_b_id.eq.${id}`).order("requested_at", { ascending: false }))).map((friend) => friendView({ ...friend, id: friend.group_id }));
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
    async blockFriend(connectionId: string) {
      const blocked = await result(client.rpc("block_friend_connection", { p_connection_id: userIdSchema.parse(connectionId) }));
      if (!blocked) throw new ChatApiError("This connection is no longer available.", "NOT_AVAILABLE");
    },
    async directMessages(connectionId: string, options: { before?: number; limit?: number } = {}, signal?: AbortSignal) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("messages").select("*")
        .eq("group_id", userIdSchema.parse(connectionId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      if (signal) query = query.abortSignal(signal);
      const rows = await result(query);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async sendDirectMessage(connectionId: string, body: unknown) {
      const group_id = userIdSchema.parse(connectionId);
      const content = messageBodySchema.parse(body);
      const id = await userId();
      const message = await result(client.from("messages").insert({ group_id, body: content, sender_id: id }).select().single());
      emit({ kind: "direct", userId: id, message });
      return message;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new ChatApiError(error.message, "SIGN_OUT_FAILED");
      await client.removeAllChannels();
    },
  };
  return api;
}
export type ChatApi = ReturnType<typeof createChatApi>;
