# QR Chat Product

QR Chat is a mobile-first authenticated social app for joining temporary venue-based conversations through physical QR codes.
Users scan or enter a QR value, join its current room, exchange group messages, become friends, and continue accepted relationships through direct messages.

Supabase Auth and PostgreSQL are authoritative for identity, membership, messages, friendships, and authorization.
Row Level Security and transactional RPCs protect data regardless of client behavior.

## Clients

Mobile web, native iOS, and native Android are active implementation targets with behavioral parity.
They share domain logic, API operations, validation, and data contracts while using platform-native presentation and navigation.

The interactive web client is available at widths up to 767px.
Desktop web is a marketing homepage and QR handoff surface rather than a chat client.

## Current Product Rules

- Authentication is required for profiles, groups, messages, friendships, and direct messages.
- Google and Apple are the supported identity providers when fully configured on the current platform.
- A user can belong to one active QR group at a time.
- Group membership expires 24 hours after joining.
- Joining a new QR group leaves the previous group.
- A room and its group messages are deleted after the final membership leaves or expires.
- Friendships and direct messages persist beyond the temporary venue session.
- Removing a friendship deletes its direct-message history.
- Clients connect directly to Supabase with public credentials and never hold privileged database keys.

## Product Safety

Server-backed reporting and blocking are required before public launch but are not implemented in the current schema.
Local hiding may provide immediate presentation relief, but it is not moderation or authorization enforcement.
Private message content and credentials must not be sent to ordinary analytics or application logs.

## Design and Future Concepts

`Design1.png` at the repository root is the only visual source of truth.
It is not an automatic feature specification.

Nearby discovery, multiple or historical groups, saved places, notifications, usernames, venue media, and lifetime statistics remain future concepts.
They require separate product and data-model approval before implementation.
