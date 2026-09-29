import type { Group, Message, Session } from "@qr-chat/domain";
import type { ChatApi } from "./index.ts";

export type ChatSnapshot = {
  session: Session | null;
  group: Group | null;
  friends: Awaited<ReturnType<ChatApi["friends"]>>;
  expiresAt: string | null;
};
export const emptySnapshot: ChatSnapshot = { session: null, group: null, friends: [], expiresAt: null };

/** Rebuild from authorized queries; never trust Realtime payloads as state. */
export async function loadChatSnapshot(api: ChatApi, pages: { groupId: string; count: number }): Promise<ChatSnapshot> {
  const id = await api.userId();
  const [profile, membership, friends] = await Promise.all([api.profile(), api.currentMembership(), api.friends()]);
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
    const current = await api.currentMembership();
    if (current?.group_id === room.id) {
      expiresAt = current.expires_at;
      group = {
        id: room.id,
        venue: { id: room.id, name: code.display_name ?? code.code_key, codes: [code.code_key], kind: "place", label: "A conversation for this QR code." },
        members: members.map((member) => ({ id: member.user_id, name: member.profiles?.display_name ?? "Participant", avatarUrl: member.profiles?.avatar_url ?? null })),
        messages: messages.reverse(), nextCursor,
      };
    }
  }
  if (await api.userId() !== id) throw new Error("Please sign in again.");
  return { session: { id, name: profile?.display_name ?? "", avatarUrl: profile?.avatar_url ?? null, hidden: [] }, group, friends, expiresAt };
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
