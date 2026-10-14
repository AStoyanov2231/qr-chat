export type Venue = { id: string; name: string; label: string; codes: string[]; kind: string; nameMissing?: boolean; imageUrl?: string | null };
export type Session = { id: string; name: string; avatarUrl?: string | null; hidden: string[] };
export type Member = { id: string; name: string; avatarUrl?: string | null };
export type Message = { id: string; user: string; name: string; avatarUrl?: string | null; text: string; time: number };
export type Group = { id: string; venue: Venue; members: Member[]; messages: Message[]; nextCursor: number | null; expiresAt: string | null };

/** A calendar-day divider for chronologically ordered messages, in the viewer's timezone. */
export function messageDayLabel(time: number, previousTime?: number): string | null {
  const date = new Date(time);
  if (previousTime !== undefined && date.toDateString() === new Date(previousTime).toDateString()) return null;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
/** "https://www.happy.co.uk/menu" → "happy". The name comes from the scanned text alone; no site is ever fetched.
 * IP addresses and punycode (lookalike) hosts get no name, so the host itself is shown instead. */
export function qrGroupName(code: string): string | null {
  if (!/^https?:\/\//iu.test(code)) return null;
  let labels: string[];
  try { labels = new URL(code).hostname.split("."); } catch { return null; }
  if (labels.length < 2 || labels.some((label) => /^(?:\d+|xn--.*)$/u.test(label))) return null;
  if (labels[0] === "www") labels.shift();
  labels.pop();
  while (labels.length > 1 && SECOND_LEVEL.has(labels.at(-1)!)) labels.pop();
  return labels.at(-1) ?? null;
}

export type FriendshipState = 'none' | 'incoming' | 'outgoing' | 'accepted';
export function friendshipState(connection: { accepted_at: string | null; requested_by_id: string } | undefined, userId: string): FriendshipState {
  if (!connection) return 'none';
  if (connection.accepted_at) return 'accepted';
  return connection.requested_by_id === userId ? 'outgoing' : 'incoming';
}

/** Only first-party QR handoff URLs are unwrapped. Other URLs remain opaque QR keys. */
export function unwrapQrCode(input: string, origin: string): string {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (url.origin === origin && url.searchParams.has("code")) return url.searchParams.get("code")!;
  }
  return input;
}

const RETAIL_FORMATS = new Set(["ean13", "ean8", "upca", "upce"]);
/** Retail barcodes become `gtin:` + GTIN-13, so one product is one group on every device. Other codes stay opaque. */
export function scannedCode(format: string, value: string): string {
  const kind = format.toLowerCase().replace(/[^a-z\d]/gu, "");
  if (!RETAIL_FORMATS.has(kind) || !/^\d+$/u.test(value)) return value;
  let digits = value;
  if (kind === "upce" && value.length === 8) {
    // UPC-E is zero-suppressed UPC-A; expand it so both scans share a key.
    const [system, a, b, c, d, e, f, check] = value;
    const body = f! <= "2" ? `${a}${b}${f}0000${c}${d}${e}` : f === "3" ? `${a}${b}${c}00000${d}${e}`
      : f === "4" ? `${a}${b}${c}${d}00000${e}` : `${a}${b}${c}${d}${e}0000${f}`;
    digits = `${system}${body}${check}`;
  }
  return [8, 12, 13].includes(digits.length) ? `gtin:${digits.padStart(13, "0")}` : value;
}

/** Shown while a group has no server-resolved name. */
export function groupFallbackName(code: string): string {
  if (code.startsWith("gtin:")) return `Product ${code.slice(5)}`;
  if (/^https?:\/\//iu.test(code)) {
    try { return new URL(code).hostname; } catch { /* not a URL after all */ }
  }
  return code.length > 40 ? `${code.slice(0, 39)}…` : code;
}

/** "Fanta Orange" from Open Food Facts fields: English name first, no pack size, brand prefixed only when missing. */
export function productGroupName(product: { product_name_en?: string; product_name?: string; brands?: string }): string | null {
  const name = (product.product_name_en || product.product_name || "").replace(/\s+/gu, " ")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|oz|lb)?$/iu, "").trim();
  const brand = (product.brands ?? "").split(",")[0]!.trim();
  // OFF "brands" is sometimes the manufacturer ("COCA-COLA SERVICES SA/NV"); a long one never prefixes a real name.
  const prefix = brand && (!name || (brand.split(" ").length <= 2 && !name.toLowerCase().includes(brand.toLowerCase())));
  return (prefix ? `${brand} ${name}` : name).trim().slice(0, 100).trim() || null;
}

export function messageAge(time: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export type GroupAccessIndicator =
  | { state: "remaining"; progress: number; label: string; accessibilityLabel: string }
  | { state: "ended"; progress: 0; label: "Access ended"; accessibilityLabel: string }
  | { state: "unknown"; progress: null; label: "Time unavailable"; accessibilityLabel: string };

export const GROUP_ACCESS_DURATION_MS = 24 * 60 * 60 * 1000;

/** Describe remaining group access for display only; authorization remains API-owned. */
export function groupAccessIndicator(expiresAt: string | null, now = Date.now()): GroupAccessIndicator {
  if (expiresAt === null || !Number.isFinite(now)) {
    return { state: "unknown", progress: null, label: "Time unavailable", accessibilityLabel: "Group access time is unavailable." };
  }

  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) {
    return { state: "unknown", progress: null, label: "Time unavailable", accessibilityLabel: "Group access time is unavailable." };
  }

  const remainingMs = expiry - now;
  if (!Number.isFinite(remainingMs)) {
    return { state: "unknown", progress: null, label: "Time unavailable", accessibilityLabel: "Group access time is unavailable." };
  }
  if (remainingMs <= 0) {
    return { state: "ended", progress: 0, label: "Access ended", accessibilityLabel: "Your group access has ended." };
  }

  const progress = Math.min(1, Math.max(0, remainingMs / GROUP_ACCESS_DURATION_MS));
  if (remainingMs < 60_000) {
    return { state: "remaining", progress, label: "Under 1m left", accessibilityLabel: "Your group access ends in less than one minute." };
  }

  const remainingMinutes = Math.floor(remainingMs / 60_000);
  if (remainingMinutes < 60) {
    const unit = remainingMinutes === 1 ? "minute" : "minutes";
    return { state: "remaining", progress, label: `${remainingMinutes}m left`, accessibilityLabel: `Your group access ends in ${remainingMinutes} ${unit}.` };
  }

  const remainingHours = Math.floor(remainingMinutes / 60);
  const unit = remainingHours === 1 ? "hour" : "hours";
  return { state: "remaining", progress, label: `${remainingHours}h left`, accessibilityLabel: `Your group access ends in ${remainingHours} ${unit}.` };
}

export function directMessagePreview(
  message: { body: string; sender_id: string | null } | null,
  userId: string | null,
): string {
  if (!message) return "Say hello";
  return userId !== null && message.sender_id === userId ? `You: ${message.body}` : message.body;
}

function finiteTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Sort conversations by latest message, then friendship acceptance, then request time. */
export function directConversationTime(
  message: { created_at: string } | null,
  acceptedAt: string | null,
  requestedAt: string,
): number {
  return finiteTimestamp(message?.created_at ?? null)
    ?? finiteTimestamp(acceptedAt)
    ?? finiteTimestamp(requestedAt)
    ?? 0;
}

type ChatFriend = { id: string; accepted_at: string | null; requested_at: string };
type ChatPreview = { status: "ready"; message: { created_at: string } | null } | { status: "error" };
export type ChatRow<F extends ChatFriend> =
  | { kind: "group"; id: string; time: number; group: Group }
  | { kind: "direct" | "request"; id: string; time: number; friend: F };
/** Groups, DMs and requests in one list; a new message or request moves its row to the top. */
export function chatRows<F extends ChatFriend>(groups: Group[], friends: F[], previews: Record<string, ChatPreview>): ChatRow<F>[] {
  const preview = (id: string) => { const value = previews[id]; return value?.status === "ready" ? value.message : null; };
  return [
    ...groups.map((group): ChatRow<F> => ({ kind: "group", id: group.id, group, time: group.messages.at(-1)?.time ?? (group.expiresAt ? Date.parse(group.expiresAt) - GROUP_ACCESS_DURATION_MS : 0) })),
    ...friends.map((friend): ChatRow<F> => ({ kind: friend.accepted_at ? "direct" : "request", id: friend.id, friend, time: directConversationTime(friend.accepted_at ? preview(friend.id) : null, friend.accepted_at, friend.requested_at) })),
  ].sort((left, right) => right.time - left.time);
}

/** Build initials from the first two Unicode letter/number words in a group name. */
export function groupInitials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.slice(0, 2).map((word) => (Array.from(word)[0] ?? "").toUpperCase()).join("");
}
