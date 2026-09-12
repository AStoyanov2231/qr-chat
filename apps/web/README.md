# QR Chat web MVP

QR Chat connects people sharing a café, restaurant, or event through a QR code.
Phones get the interactive app; screens wider than 767px get a product landing page with a QR handoff to a phone.
The mobile app supports code entry, display names, first-visitor group creation, joining, text chat, group information, reporting, local hiding, and leaving.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter web dev
```

Open http://localhost:3000 for the desktop landing page.
Use a phone or a browser viewport no wider than 767px for the app.
For a real phone on the same Wi-Fi, use the network address printed by Next.js.
Set `NEXT_PUBLIC_APP_URL` in `apps/web/.env.local` to that network origin so the desktop QR opens it on the phone.
For deployment, set it to the public HTTPS origin or leave it unset to use the current origin.

## Demo codes

| Code | Behavior |
| --- | --- |
| `CORNER-01`, `CORNER-02` | Both resolve to The Corner Café |
| `GARDEN-01` | The Garden Table |
| `STUDIO-01` | After Hours |
| `CLOSED-01` | Closed conversation error |
| `DELETED-01` | Deleted QR code error |
| Any unregistered code | Helpful invalid-code error |

Direct links use `/?code=CORNER-01`.
Desktop preserves the link's code in its phone QR.
Registered spaces start without a group; the first visitor who supplies a name creates one.
No sample participants or messages are inserted into real chats.
The desktop phone illustration contains clearly labeled example conversation content.

## Local preview boundaries

The `src/lib/chat-store.ts` adapter owns browser persistence and is the boundary to replace with Supabase later.
Each message and membership has its own storage key to avoid overwriting other tabs' messages.
Storage events update other tabs immediately without a reload.
A browser profile has one remembered identity and joined-group list.
Membership is unique per identity and group.
Active counts use a 30-second heartbeat and a 90-second freshness window.
Reports are saved locally and are not delivered to a moderation service.
Hiding filters a participant's messages locally and can be undone in group information.

Different devices and browser profiles do not share data yet.
Groups and messages currently persist until browser data is cleared; automatic expiry awaits a defined retention policy and backend.
QR registrations and closed/deleted states are fixtures, not an admin dashboard.
There is no in-app camera scanner; a phone's camera opens QR links, and the app supports manual entry.
Mobile-native work and external services remain untouched.

## Verify

Node 22.18+ is required for the tests' native TypeScript loading.

```sh
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

Storage tests cover aliases, invalid codes, first creation, duplicate joins, multiple senders, chronological messages, leaving and rejoining, content validation, local hiding, and report persistence.
