export type Venue = { id: string; name: string; label: string; codes: string[]; kind: string; nameMissing?: boolean };
export type Session = { id: string; name: string; avatarUrl?: string | null; hidden: string[] };
export type Member = { id: string; name: string; avatarUrl?: string | null };
export type Message = { id: string; user: string; name: string; avatarUrl?: string | null; text: string; time: number };
export type Group = { id: string; venue: Venue; members: Member[]; messages: Message[]; nextCursor: number | null };

export type QrPageNameMetadata = {
  structuredData: { types: string[]; names: string[] }[];
  openGraphTitles: string[];
  pageTitles: string[];
  siteNames: string[];
};

type NameCandidate = { name: string; normalized: string };
const BUSINESS_TYPES = new Set([
  "barorpub", "cafeorcoffeeshop", "foodestablishment", "hotel", "localbusiness",
  "lodgingbusiness", "restaurant", "store", "touristattraction",
]);
const GENERIC_NAMES = new Set([
  "404", "access denied", "home", "home page", "homepage", "login", "menu", "not found",
  "online ordering", "order online", "page not found", "sign in", "sign up", "untitled", "welcome",
]);
const LINK_PROVIDERS = new Set([
  "clover", "chownow", "doordash", "google", "grubhub", "linktree", "lightspeed",
  "menufy", "my menu", "order online", "square", "squareup", "spoton", "toast", "ubereats",
]);

function normalizeVenueName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function metadataName(value: string): NameCandidate | null {
  const name = value.replace(/\p{Cc}/gu, "").replace(/\s+/gu, " ").trim();
  if (!name || name.length > 100 || !/\p{L}/u.test(name)) return null;
  // Page metadata sometimes repeats the scanned URL or a deployment slug as
  // its title. Keep those technical identifiers out of the shared chat name.
  if (/^(?:https?:\/\/|www\.)/iu.test(name)
      || /^(?:[\p{L}\d](?:[\p{L}\d-]{0,61}[\p{L}\d])?\.)+[a-z]{2,}(?:[/:?#].*)?$/iu.test(name)) return null;
  const parts = name.split(/\s*(?:\||•)\s*|\s+[\-–—]\s+/u).filter(Boolean);
  const usefulParts = parts.filter((part) => {
    const normalized = normalizeVenueName(part);
    return normalized && !GENERIC_NAMES.has(normalized) && !LINK_PROVIDERS.has(normalized);
  });
  const uniqueParts = [...new Map(usefulParts.map((part) => [normalizeVenueName(part), part])).values()];
  if (uniqueParts.length !== 1) return null;
  const resolvedName = uniqueParts[0]!.trim();
  const normalized = normalizeVenueName(resolvedName);
  if (!normalized || GENERIC_NAMES.has(normalized) || LINK_PROVIDERS.has(normalized)) return null;
  return { name: resolvedName, normalized };
}

function relatedNames(left: NameCandidate, right: NameCandidate): boolean {
  return left.normalized === right.normalized
    || left.normalized.startsWith(`${right.normalized} `)
    || right.normalized.startsWith(`${left.normalized} `);
}

function chooseConsistent(values: string[]): NameCandidate | null {
  const candidates = values.flatMap((value) => {
    const parsed = metadataName(value);
    return parsed ? [parsed] : [];
  });
  const unique = [...new Map(candidates.map((candidate) => [candidate.normalized, candidate])).values()];
  if (!unique.length || unique.some((candidate) => !unique.every((other) => relatedNames(candidate, other)))) return null;
  return [...unique].sort((left, right) =>
    left.normalized.split(" ").length - right.normalized.split(" ").length
    || left.name.length - right.name.length,
  )[0] ?? null;
}

/** Resolve a venue name only when page metadata supports one consistent identity. */
export function resolveQrPageName(metadata: QrPageNameMetadata): string | null {
  const businessNames = metadata.structuredData
    .filter(({ types }) => types.some((type) => BUSINESS_TYPES.has(type.toLowerCase().split(/[\/#]/u).at(-1) ?? type.toLowerCase())))
    .flatMap(({ names }) => names);
  const hasBusinessCandidate = businessNames.some((name) => metadataName(name) !== null);
  const business = chooseConsistent(businessNames);
  const titles = [...metadata.openGraphTitles, ...metadata.pageTitles];
  const hasTitleCandidate = titles.some((name) => metadataName(name) !== null);
  const title = chooseConsistent(titles);
  if ((hasBusinessCandidate && !business) || (hasTitleCandidate && !title)) return null;
  if (business && title) return relatedNames(business, title) ? business.name : null;
  if (business) return business.name;
  if (title) return title.name;
  return chooseConsistent(metadata.siteNames)?.name ?? null;
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

export function messageAge(time: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
