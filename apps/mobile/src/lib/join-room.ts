import type { ChatApi } from '@qr-chat/api';
import type { Group } from '@qr-chat/domain';

/** Joins the scanned QR chat, or names the current one, and returns the room to open. */
export async function joinRoom(api: Pick<ChatApi, 'joinNamedGroup' | 'nameCurrentQrChatIfEmpty'>, current: Pick<Group, 'id' | 'venue'> | null, code: string, name: string) {
  if (current?.venue.codes[0] === code) {
    const canonicalName = await api.nameCurrentQrChatIfEmpty(code, name);
    return { ...current, venue: { ...current.venue, name: canonicalName, nameMissing: false } };
  }
  const membership = await api.joinNamedGroup(code, name);
  return { id: membership.group_id, venue: { id: code, name: membership.display_name, nameMissing: false, codes: [code], kind: 'place', label: 'A conversation for this QR code.' } };
}
