import type { Message, Group, Session } from '@qr-chat/domain';
import type { ChatApi } from './index.ts';
import type { ChatOverview, GroupMessage, Friend } from './overview.ts';
import type { Tables } from '@qr-chat/types';

export type DirectPreview = { status: 'ready'; message: Tables<'direct_messages'> | null } | { status: 'error' };
export type ChatSnapshot = { session: Session | null; group: Group | null; friends: Friend[]; expiresAt: string | null; directPreviews: Record<string, DirectPreview> };
export const emptySnapshot: ChatSnapshot = { session: null, group: null, friends: [], expiresAt: null, directPreviews: {} };
export function groupMessageView(message: GroupMessage): Message {
  return { id: String(message.id), user: message.sender_id ?? 'deleted', name: message.profiles?.display_name ?? 'Former participant', avatarUrl: message.profiles?.avatar_url ?? null, text: message.body, time: Date.parse(message.created_at) };
}
export function snapshotFromOverview(overview: ChatOverview): ChatSnapshot {
  const room = overview.membership?.qr_groups;
  const code = room?.qr_codes;
  return {
    session: { id: overview.userId, name: overview.profile?.display_name ?? '', avatarUrl: overview.profile?.avatar_url ?? null, hidden: [] },
    group: room && code ? { id: room.id, venue: { id: room.id, name: code.display_name ?? 'Unnamed chat', nameMissing: code.display_name === null, codes: [code.code_key], kind: 'place', label: 'A conversation for this QR code.' }, members: overview.members.map((member) => ({ id: member.user_id, name: member.profiles?.display_name ?? 'Participant', avatarUrl: member.profiles?.avatar_url ?? null })), messages: overview.groupPreview ? [groupMessageView(overview.groupPreview)] : [], nextCursor: null } : null,
    friends: overview.friends,
    expiresAt: overview.membership?.expires_at ?? null,
    directPreviews: Object.fromEntries(overview.friends.filter((friend) => friend.accepted_at).map((friend) => [friend.id, { status: 'ready' as const, message: overview.directPreviews[friend.id] ?? null }])),
  };
}

/** Standalone bootstrap helper. Interactive clients use the session store's page cache. */
export async function loadChatSnapshot(api: ChatApi, pages: { groupId: string; count: number }): Promise<ChatSnapshot> {
  const id = await api.userId();
  const snapshot = snapshotFromOverview(await api.overview());
  if (snapshot.group) {
    const group = snapshot.group;
    const count = pages.groupId === group.id ? pages.count : 1;
    let before: number | undefined;
    const messages: GroupMessage[] = [];
    for (let page = 0; page < count; page++) {
      const data = await api.groupMessages(group.id, { before });
      messages.push(...data.items); group.nextCursor = data.nextCursor;
      if (data.nextCursor === null) break;
      before = data.nextCursor;
    }
    group.messages = messages.reverse().map(groupMessageView);
  }
  const access = await api.access();
  if (await api.userId() !== id || access.userId !== id || snapshot.session?.id !== id) throw new Error('Please sign in again.');
  if (snapshot.group?.id !== access.membership?.group_id) { snapshot.group = null; snapshot.expiresAt = null; }
  const accepted = new Set(access.acceptedConnectionIds);
  snapshot.friends = snapshot.friends.filter((friend) => !friend.accepted_at || accepted.has(friend.id));
  for (const connectionId of Object.keys(snapshot.directPreviews)) if (!accepted.has(connectionId)) delete snapshot.directPreviews[connectionId];
  return snapshot;
}
export async function loadDirectSnapshot(api: ChatApi, connectionId: string, count = 1) {
  const id = await api.userId();
  const check = async () => {
    const access = await api.access();
    if (access.userId !== id || !access.acceptedConnectionIds.includes(connectionId)) throw new Error('This friendship is no longer available.');
  };
  await check();
  const messages: Tables<'direct_messages'>[] = [];
  let before: number | undefined;
  let nextCursor: number | null = null;
  for (let page = 0; page < count; page++) {
    const data = await api.directMessages(connectionId, { before });
    messages.push(...data.items); nextCursor = data.nextCursor;
    if (nextCursor === null) break;
    before = nextCursor;
  }
  await check();
  if (await api.userId() !== id) throw new Error('Please sign in again.');
  return { messages: messages.reverse(), nextCursor };
}
