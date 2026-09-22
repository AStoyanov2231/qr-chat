import type { Group } from '@qr-chat/domain';

/** Navigation remembers the opened room; a membership update must not retarget it. */
export function roomRoute(group: Pick<Group, 'id' | 'venue'>) {
  return {
    pathname: '/room' as const,
    params: { groupId: group.id, code: group.venue.codes[0], name: group.venue.name },
  };
}
