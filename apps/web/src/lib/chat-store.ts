export type Venue = {
  id: string;
  name: string;
  label: string;
  codes: string[];
  kind: string;
  closed?: boolean;
  deleted?: boolean;
};
export const venues: Venue[] = [
  {
    id: "corner",
    name: "The Corner Café",
    label: "A little coffee, a little conversation.",
    codes: ["CORNER-01", "CORNER-02"],
    kind: "cafe",
  },
  {
    id: "garden",
    name: "The Garden Table",
    label: "Good food. Better company.",
    codes: ["GARDEN-01"],
    kind: "restaurant",
  },
  {
    id: "studio",
    name: "After Hours",
    label: "Meet the people behind the ideas.",
    codes: ["STUDIO-01"],
    kind: "event",
  },
  {
    id: "closed",
    name: "Sunday Social",
    label: "This event has ended.",
    codes: ["CLOSED-01"],
    kind: "event",
    closed: true,
  },
  {
    id: "deleted",
    name: "Old location",
    label: "",
    codes: ["DELETED-01"],
    kind: "cafe",
    deleted: true,
  },
];
export type Session = { id: string; name: string; hidden: string[] };
export type Member = { id: string; name: string; joined: number; seen: number };
export type Message = {
  id: string;
  group: string;
  user: string;
  name: string;
  text: string;
  time: number;
};
export type Group = {
  id: string;
  created: number;
  members: Member[];
  messages: Message[];
};
// getRandomValues also works on a phone opening an HTTP LAN preview.
function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
const prefix = "qrchat:v1:";
function read<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(prefix + key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
  window.dispatchEvent(new Event("qrchat"));
}
export function getSession(): Session {
  return read<Session>("session", {
    id: createId(),
    name: "",
    hidden: [],
  });
}
export function saveSession(session: Session) {
  write("session", session);
}
export function getGroup(id: string): Group | null {
  const created = read<number | null>("group:" + id, null);
  if (created === null) return null;
  const members: Member[] = [],
    messages: Message[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(prefix + "member:" + id + ":")) {
      const member = read<Member | null>(key.slice(prefix.length), null);
      if (member) members.push(member);
    }
    if (key.startsWith(prefix + "message:" + id + ":")) {
      const message = read<Message | null>(key.slice(prefix.length), null);
      if (message) messages.push(message);
    }
  }
  return {
    id,
    created,
    members,
    messages: messages.sort(
      (a, b) => a.time - b.time || a.id.localeCompare(b.id),
    ),
  };
}
export function joinGroup(id: string, session: Session) {
  const venue = venues.find((v) => v.id === id);
  if (!venue || venue.closed || venue.deleted)
    throw new Error("Group unavailable");
  if (!session.name.trim() || session.name.length > 30)
    throw new Error("Invalid display name");
  if (!getGroup(id)) write("group:" + id, Date.now());
  const existing = read<Member | null>("member:" + id + ":" + session.id, null);
  write("member:" + id + ":" + session.id, {
    id: session.id,
    name: session.name,
    joined: existing?.joined ?? Date.now(),
    seen: Date.now(),
  });
}
export function leaveGroup(id: string, user: string) {
  localStorage.removeItem(prefix + "member:" + id + ":" + user);
  window.dispatchEvent(new Event("qrchat"));
}
export function heartbeat(id: string, session: Session) {
  const member = read<Member | null>("member:" + id + ":" + session.id, null);
  if (member)
    write("member:" + id + ":" + session.id, { ...member, seen: Date.now() });
}
export function sendMessage(group: string, session: Session, text: string) {
  const venue = venues.find((v) => v.id === group);
  if (
    !venue ||
    venue.closed ||
    venue.deleted ||
    !getGroup(group)?.members.some((m) => m.id === session.id)
  )
    throw new Error("Join an open group before sending");
  if (!text.trim() || text.length > 2000) throw new Error("Invalid message");
  const id = createId();
  write("message:" + group + ":" + id, {
    id,
    group,
    user: session.id,
    name: session.name,
    text,
    time: Date.now(),
  });
}
export function reportMessage(message: Message, user: string) {
  write("report:" + message.id + ":" + user, {
    message: message.id,
    user,
    time: Date.now(),
  });
}
export function resolveCode(input: string): Venue | undefined {
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    try {
      const url = new URL(code);
      if (url.origin !== window.location.origin) return;
      code = url.searchParams.get("code") ?? "";
    } catch {
      return;
    }
  }
  return venues.find((v) => v.codes.includes(code.toUpperCase()));
}
