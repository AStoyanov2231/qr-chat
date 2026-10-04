import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@qr-chat/types";
import { codeKeySchema, qrNameSchema, qrNameLookupResponseSchema, profileSchema, userIdSchema, messageBodySchema, pageSchema, displayNameSchema, avatarUploadSchema } from "@qr-chat/validation";
import type { ChatOverview, ChatAccess, ChatMutation, GroupMessage } from "./overview.ts";
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

function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (action: () => void) => {
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => finish(() => reject(signal.reason ?? new Error("Operation cancelled")));
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Operation cancelled"));
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
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

/** Inject an authenticated public client. Session storage and auth lifecycle belong to the host platform. */
export type ChatNameResolution =
  | { kind: "saved" | "suggested"; name: string }
  | { kind: "missing" };

export function createChatApi(
  client: SupabaseClient<Database>,
  options: { qrNameEndpoint?: string; fetcher?: typeof fetch } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const qrNameEndpoint = options.qrNameEndpoint ?? "/api/qr-name";
  const mutations = new Set<(event: ChatMutation) => void>();
  const emit = (event: ChatMutation) => { for (const listener of mutations) listener(event); };
  async function userId() {
    // This ID supplies query filters, never authorization. PostgreSQL enforces RLS.
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
    return data.session.user.id;
  }
  const metadata = new Map<string, { userId: string; expires: number; value: { name: string | null; imageUrl?: string | null } }>();
  const metadataRequests = new Map<string, Promise<{ name: string | null; imageUrl?: string | null }>>();
  let sessionGeneration = 0;
  async function lookupMetadata(code: string) {
    if (!qrNameEndpoint) return { name: null, imageUrl: null };
    const { data, error } = await client.auth.getSession();
    const session = data.session;
    if (error || !session) return { name: null, imageUrl: null };
    const key = `${session.user.id}:${code}`;
    const cached = metadata.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pending = metadataRequests.get(key);
    if (pending) return pending;
    const request = (async () => {
      const generation = sessionGeneration;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetcher(qrNameEndpoint, {
          method: "POST", credentials: "same-origin",
          headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
          body: JSON.stringify({ code }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("Metadata unavailable");
        const value = qrNameLookupResponseSchema.parse(await response.json());
        const currentId = await userId();
        if (generation !== sessionGeneration || currentId !== session.user.id) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
        if (value.name || value.imageUrl) {
          if (metadata.size >= 100) metadata.delete(metadata.keys().next().value!);
          metadata.set(key, { userId: session.user.id, expires: Date.now() + 3600000, value });
        }
        return value;
      } finally { clearTimeout(timeout); }
    })();
    metadataRequests.set(key, request);
    try { return await request; } finally { if (metadataRequests.get(key) === request) metadataRequests.delete(key); }
  }
  async function qrChatName(code: unknown, signal?: AbortSignal): Promise<string | null> {
    let request = client.rpc("get_qr_chat_name", {
      p_code_key: codeKeySchema.parse(code),
    });
    if (signal) request = request.abortSignal(signal);
    const name = await nullableResult(request);
    return typeof name === "string" && name.trim() ? qrNameSchema.parse(name) : null;
  }
  const api = {
    client,
    userId,
    onMutation(listener: (event: ChatMutation) => void) { mutations.add(listener); return () => { mutations.delete(listener); }; },
    clearSessionCache() { sessionGeneration++; metadata.clear(); metadataRequests.clear(); },
    async overview(signal?: AbortSignal): Promise<ChatOverview> {
      let query = client.rpc("get_chat_overview");
      if (signal) query = query.abortSignal(signal);
      return await result(query) as unknown as ChatOverview;
    },
    async access(signal?: AbortSignal): Promise<ChatAccess> {
      let query = client.rpc("get_chat_access");
      if (signal) query = query.abortSignal(signal);
      return await result(query) as unknown as ChatAccess;
    },
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
    /** undefined keeps the current photo; null removes it. Uploads use immutable keys. */
    async saveProfileWithAvatar(name: string, photo?: AvatarUpload | null): Promise<Tables<"profiles">> {
      const display_name = displayNameSchema.parse(name);
      const upload = photo ? avatarUploadSchema.parse(photo) : photo;
      if (upload === undefined) return api.saveProfile({ display_name });
      const id = await userId();
      const previous = await api.profile();
      const bucket = client.storage.from("avatars");
      let avatar_url: string | null = null;
      if (upload) {
        const path = `${id}/${upload.uploadId}.jpg`;
        await result(bucket.upload(path, upload.data, { contentType: "image/jpeg", cacheControl: "3600", upsert: false }));
        avatar_url = bucket.getPublicUrl(path).data.publicUrl;
      }
      // A failed response can follow a committed write. Retain the upload on failure
      // rather than deleting an image the profile may now reference.
      if (await userId() !== id) throw new ChatApiError("Please sign in again.", "AUTH_REQUIRED");
      const saved = await api.saveProfile({ display_name, avatar_url });
      const prefix = bucket.getPublicUrl(`${id}/`).data.publicUrl;
      if (previous?.avatar_url !== avatar_url && previous?.avatar_url?.startsWith(prefix)) {
        const filename = previous.avatar_url.slice(prefix.length);
        if (/^[0-9a-f-]{36}\.jpg$/i.test(filename)) {
          // Cleanup failure must not turn a committed profile save into a failed form.
          try { await bucket.remove([`${id}/${filename}`]); } catch { /* best effort */ }
        }
      }
      return saved;
    },
    async joinGroup(code: unknown, name?: unknown) {
      const data = await result(client.rpc("join_qr_group", {
        p_code_key: codeKeySchema.parse(code),
        ...(name === undefined ? {} : { p_display_name: qrNameSchema.parse(name) }),
      }));
      if (!data[0]) throw new ChatApiError("Unable to join this room.");
      return data[0];
    },
    async joinNamedGroup(code: unknown, name: unknown) {
      const { data, error } = await client.rpc("join_named_qr_group", {
        p_code_key: codeKeySchema.parse(code),
        p_display_name: qrNameSchema.parse(name),
      });
      if (error) throw new ChatApiError(error.message, error.code);
      if (!data?.[0]) throw new ChatApiError("Unable to join this chat.");
      return data[0];
    },
    qrChatName,
    async nameCurrentQrChatIfEmpty(code: unknown, name: unknown): Promise<string> {
      return result(client.rpc("name_current_qr_chat_if_empty", {
        p_code_key: codeKeySchema.parse(code),
        p_display_name: qrNameSchema.parse(name),
      }));
    },
    async resolveQrChatImage(code: unknown, signal?: AbortSignal): Promise<string | null> {
      try {
        const request = lookupMetadata(codeKeySchema.parse(code));
        const value = signal ? await abortable(request, signal) : await request;
        return value.imageUrl ?? null;
      } catch { return null; }
    },
    async resolveQrChatName(code: unknown, signal?: AbortSignal): Promise<ChatNameResolution> {
      const codeKey = codeKeySchema.parse(code);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 3500);
      try {
        let saved: string | null = null;
        try { saved = await abortable(qrChatName(codeKey, controller.signal), controller.signal); } catch { /* Try optional metadata. */ }
        if (saved) return { kind: "saved", name: saved };
        if (controller.signal.aborted) return { kind: "missing" };
        const value = await abortable(lookupMetadata(codeKey), controller.signal);
        return value.name ? { kind: "suggested", name: value.name } : { kind: "missing" };
      } catch { return { kind: "missing" }; }
      finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
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
    async groupMessages(groupId: string, options: { before?: number; limit?: number } = {}, signal?: AbortSignal) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("group_messages").select("*, profiles(display_name, avatar_url)")
        .eq("group_id", userIdSchema.parse(groupId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      if (signal) query = query.abortSignal(signal);
      const rows = await result(query);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async groupMessageIds(groupId: string, ids: number[], signal?: AbortSignal): Promise<GroupMessage[]> {
      let query = client.from("group_messages").select("*, profiles(display_name, avatar_url)")
        .eq("group_id", userIdSchema.parse(groupId)).in("id", ids.map((id) => pageSchema.parse({ before: id }).before!));
      if (signal) query = query.abortSignal(signal);
      return result(query);
    },
    async directMessageIds(connectionId: string, ids: number[], signal?: AbortSignal) {
      let query = client.from("direct_messages").select("*")
        .eq("friend_connection_id", userIdSchema.parse(connectionId)).in("id", ids.map((id) => pageSchema.parse({ before: id }).before!));
      if (signal) query = query.abortSignal(signal);
      return result(query);
    },
    async sendGroupMessage(groupId: string, body: unknown) {
      const group_id = userIdSchema.parse(groupId);
      const content = messageBodySchema.parse(body);
      const id = await userId();
      const message = await result(client.from("group_messages").insert({ group_id, body: content, sender_id: id }).select("*, profiles(display_name, avatar_url)").single());
      emit({ kind: "group", userId: id, message });
      return message;
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
    async blockFriend(connectionId: string) {
      const blocked = await result(client.rpc("block_friend_connection", { p_connection_id: userIdSchema.parse(connectionId) }));
      if (!blocked) throw new ChatApiError("This connection is no longer available.", "NOT_AVAILABLE");
    },
    async directMessages(connectionId: string, options: { before?: number; limit?: number } = {}, signal?: AbortSignal) {
      const { before, limit } = pageSchema.parse(options);
      let query = client.from("direct_messages").select("*")
        .eq("friend_connection_id", userIdSchema.parse(connectionId)).order("id", { ascending: false }).limit(limit + 1);
      if (before !== undefined) query = query.lt("id", before);
      if (signal) query = query.abortSignal(signal);
      const rows = await result(query);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    },
    async sendDirectMessage(connectionId: string, body: unknown) {
      const friend_connection_id = userIdSchema.parse(connectionId);
      const content = messageBodySchema.parse(body);
      const id = await userId();
      const message = await result(client.from("direct_messages").insert({ friend_connection_id, body: content, sender_id: id }).select().single());
      emit({ kind: "direct", userId: id, message });
      return message;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new ChatApiError(error.message, "SIGN_OUT_FAILED");
      api.clearSessionCache();
      await client.removeAllChannels();
    },
  };
  return api;
}
export type ChatApi = ReturnType<typeof createChatApi>;
