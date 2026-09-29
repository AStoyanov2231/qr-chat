# Product Contract

Shared by mobile web, iOS, Android. Authenticated QR venue groups, profiles, friendships, and DMs. Desktop: marketing/handoff; interactive web width ≤767px.

## Lifecycle

- One active group per user; membership expires 24 hours after joining.
- Joining another group leaves the previous one.
- Removing/expiring the final membership deletes the room and group messages.
- Friendships and DMs persist beyond venue membership.
- Removing a friendship deletes its DM history.
- Account deletion removes profile, memberships, and friendships through database relationships.
- QR keys remain opaque and case-sensitive.

## Access and scope

- Profiles, rooms, messages, friendships, and DMs require authentication; no guest chat.
- Public: desktop marketing, sign-in, OAuth callback, explicitly public legal/support pages.
- Google/Apple appear only when configured and tested on the platform.
- PostgreSQL/RLS/RPCs authorize access; client state never does.
- Server-backed reporting/blocking is required before launch and currently unimplemented. Local hiding does not enforce moderation.
- Nearby discovery, group history, saved places, notifications, usernames, venue media, and lifetime statistics require approved product/database work.

Design: [DESIGN.md](../../DESIGN.md). Architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md).
