# Product Contract

Shared by mobile web, iOS, and Android. Authenticated QR venue groups, profiles, friendships, and DMs. Desktop: marketing and handoff; interactive web width ≤767px.

## Lifecycle

- One active group per user; membership expires 24 hours after joining.
- Joining another group leaves the previous one.
- Removing or expiring the final membership deletes the room and group messages.
- Friendships and DMs persist beyond venue membership.
- Removing a friendship deletes its DM history.
- Account deletion removes profile, memberships, and friendships through database relationships.
- QR keys remain opaque and case-sensitive.
- Joining or rejoining a group starts with a camera scan. No typed or pasted code entry; external join links open the scanner. Opening an active group from Groups does not rejoin it.
- A QR code's exact key identifies its shared chat name. After scanning, clients use the saved name or a conservative suggestion from the linked public page metadata. If neither yields a useful name, the participant joining supplies a required name (up to 100 characters). Names are shared by all participants and the first saved name wins; URL text is never used as a display-name fallback.
- A legacy active room without a saved name appears as “Unnamed chat.” Its current member can name it from a fresh scan without rejoining. Names stay with the QR code when the last participant leaves and the room is deleted.
- Tap a group member's name/avatar or member-list row to open their profile. Send/cancel a request, accept/decline an incoming request, or message an accepted friend. Requests still require a shared active group; accepted friends can message after leaving.
- Edit Profile supports choosing, previewing, replacing, and removing a photo. Photos appear in member profiles, group messages, friends, and DM headers. Avatar image URLs are public; only the owner can upload/delete their files.

## Access and scope

- Profiles, rooms, messages, friendships, and DMs require authentication; no guest chat.
- Public: desktop marketing, sign-in, OAuth callback, explicitly public legal/support pages.
- Google/Apple appear only when configured and tested on the platform.
- PostgreSQL/RLS/RPCs authorize access; client state never does.
- Server-backed reporting/blocking is required before launch and currently unimplemented. Local hiding does not enforce moderation.
- Nearby discovery, group history, saved places, notifications, usernames, venue media, and lifetime statistics require approved product/database work.

Design: [DESIGN.md](DESIGN.md). Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).
