import { codeKeySchema } from "@qr-chat/validation";
import { unwrapQrCode, type Venue } from "@qr-chat/domain";
export type { Venue, Session, Message, Group } from "@qr-chat/domain";

export type DirectConversationScope = { connectionId: string | null; version: number };

/** Ignore a pending direct-chat result after the person switches conversations. */
export function directConversationScopeIsCurrent(current: DirectConversationScope, expected: DirectConversationScope): boolean {
  return current.connectionId === expected.connectionId && current.version === expected.version;
}

/** QR keys are opaque and case-sensitive, just like PostgreSQL's unique key. */
export function resolveCode(input: string, origin: string): Venue {
  const code = codeKeySchema.parse(unwrapQrCode(input, origin));
  return { id: code, name: code, label: "A conversation for this QR code.", codes: [code], kind: "place" };
}
