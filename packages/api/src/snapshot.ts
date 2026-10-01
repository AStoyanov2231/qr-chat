import type { Group, Message, Session } from "@qr-chat/domain";
import type { Tables } from "@qr-chat/types";
import type { ChatApi } from "./index.ts";

export type DirectPreview =
  | { status: "ready"; message: Tables<"direct_messages"> | null }
  | { status: "error" };

export type ChatSnapshot = {
  session: Session | null;
  group: Group | null;
  friends: Awaited<ReturnType<ChatApi["friends"]>>;
  expiresAt: string | null;
  directPreviews: Record<string, DirectPreview>;
};
export const emptySnapshot: ChatSnapshot = { session: null, group: null, friends: [], expiresAt: null, directPreviews: {} };

const DIRECT_PREVIEW_CONCURRENCY = 4;

async function loadDirectPreviews(
  api: ChatApi,
  friends: Awaited<ReturnType<ChatApi["friends"]>>,
): Promise<Record<string, DirectPreview>> {
  const accepted = friends.filter((friend) => Boolean(friend.accepted_at));
  const previews: Record<string, DirectPreview> = {};
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      const friend = accepted[index];
      if (!friend) return;
      try {
        const page = await api.directMessages(friend.id, { limit: 1 });
        previews[friend.id] = { status: "ready", message: page.items[0] ?? null };
      } catch {
        previews[friend.id] = { status: "error" };
      }
    }
  }

  const workerCount = Math.min(DIRECT_PREVIEW_CONCURRENCY, accepted.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return previews;
}

/** Rebuild from authorized queries; never trust Realtime payloads as state. */
export async function loadChatSnapshot(api: ChatApi, pages: { groupId: string; count: number }): Promise<ChatSnapshot> {
  const id = await api.userId();
  const [profile, membership, friends] = await Promise.all([api.profile(), api.currentMembership(), api.friends()]);
  const directPreviewsPromise = loadDirectPreviews(api, friends);
  let directPreviews: Record<string, DirectPreview> | null = null;
  let group: Group | null = null;
  let expiresAt: string | null = null;
  if (membership?.qr_groups?.qr_codes) {
    const room = membership.qr_groups;
    const code = room.qr_codes!;
    const count = pages.groupId === room.id ? pages.count : 1;
    const members = await api.members(room.id);
    const messages: Message[] = [];
    let before: number | undefined;
    let nextCursor: number | null = null;
    for (let page = 0; page < count; page++) {
      const data = await api.groupMessages(room.id, { before });
      messages.push(...data.items.map((message) => ({
        id: String(message.id), user: message.sender_id ?? "deleted", name: message.profiles?.display_name ?? "Former participant", avatarUrl: message.profiles?.avatar_url ?? null,
        text: message.body, time: Date.parse(message.created_at),
      })));
      nextCursor = data.nextCursor;
      if (nextCursor === null) break;
      before = nextCursor;
    }
    directPreviews = await directPreviewsPromise;
    const current = await api.currentMembership();
    if (current?.group_id === room.id) {
      expiresAt = current.expires_at;
      group = {
        id: room.id,
        venue: {
          id: room.id,
          name: code.display_name ?? "Unnamed chat",
          nameMissing: code.display_name === null,
          codes: [code.code_key],
          kind: "place",
          label: "A conversation for this QR code.",
        },
        members: members.map((member) => ({ id: member.user_id, name: member.profiles?.display_name ?? "Participant", avatarUrl: member.profiles?.avatar_url ?? null })),
        messages: messages.reverse(), nextCursor,
      };
    }
  }
  if (directPreviews === null) directPreviews = await directPreviewsPromise;
  let currentFriends = friends;
  try {
    currentFriends = await api.friends();
    const acceptedIds = new Set(currentFriends.filter((friend) => Boolean(friend.accepted_at)).map((friend) => friend.id));
    for (const connectionId of Object.keys(directPreviews)) {
      if (!acceptedIds.has(connectionId)) delete directPreviews[connectionId];
    }
    for (const connectionId of acceptedIds) {
      if (directPreviews[connectionId] === undefined) directPreviews[connectionId] = { status: "error" };
    }
  } catch {
    // If friendship state cannot be revalidated, keep the contacts but fail closed
    // for every preview that depended on an accepted connection.
    for (const friend of friends) {
      if (friend.accepted_at) directPreviews[friend.id] = { status: "error" };
    }
  }
  if (await api.userId() !== id) throw new Error("Please sign in again.");
  return {
    session: { id, name: profile?.display_name ?? "", avatarUrl: profile?.avatar_url ?? null, hidden: [] },
    group,
    friends: currentFriends,
    expiresAt,
    directPreviews,
  };
}

export async function loadDirectSnapshot(api: ChatApi, connectionId: string, count = 1) {
  const id = await api.userId();
  const checkFriend = async () => {
    const friends = await api.friends();
    if (!friends.some((friend) => friend.id === connectionId && friend.accepted_at)) throw new Error("This friendship is no longer available.");
  };
  await checkFriend();
  const messages: Awaited<ReturnType<ChatApi["directMessages"]>>["items"] = [];
  let before: number | undefined;
  let nextCursor: number | null = null;
  for (let page = 0; page < count; page++) {
    const data = await api.directMessages(connectionId, { before });
    messages.push(...data.items);
    nextCursor = data.nextCursor;
    if (nextCursor === null) break;
    before = nextCursor;
  }
  await checkFriend();
  if (await api.userId() !== id) throw new Error("Please sign in again.");
  return { messages: messages.reverse(), nextCursor };
}
