import type { Tables } from "@qr-chat/types";

/** avatar_url is derived from avatar_path by the API; the database stores only the path. */
export type Profile = Tables<"profiles"> & { avatar_url: string | null };
/** expires_at is derived from joined_at by the public.expires_at computed field. */
type MembershipRow = Tables<"group_members"> & { expires_at: string };
/** A friendship's id is its DM group id; DM messages and previews are keyed by it. */
export type Friend = Tables<"friendships"> & { id: string; user_a: Profile | null; user_b: Profile | null };
/** image_url is derived from image_path by the API, like avatar_url. */
export type Membership = MembershipRow & { groups: (Tables<"groups"> & { image_url: string | null }) | null };
export type Member = MembershipRow & { profiles: Profile | null };
export type DirectMessage = Tables<"messages">;
export type GroupMessage = DirectMessage & { profiles: (Pick<Profile, "display_name" | "avatar_url"> & { avatar_path?: string | null }) | null };
/** The active business place behind a group; menu_url is derived from menu_path by the API. */
export type VenuePlace = { owner_id: string; link_url: string | null; menu_path: string | null; menu_url: string | null; photo_path: string | null };
/** One entry per active QR group, newest join first. */
export type GroupOverview = Membership & { members: Member[]; preview: GroupMessage | null; headIds: number[]; place?: VenuePlace | null };
export type ChatOverview = {
  userId: string;
  profile: Profile | null;
  memberships: GroupOverview[];
  friends: Friend[];
  directPreviews: Record<string, DirectMessage | null>;
  /** Other people's unread messages per group or DM id (capped at 100); chats with none are left out. */
  unread: Record<string, number>;
};
export type ChatAccess = { userId: string; memberships: Pick<MembershipRow, "group_id" | "expires_at">[]; acceptedConnectionIds: string[] };
export type ChatMutation =
  | { kind: "overview" }
  | { kind: "group"; userId: string; message: GroupMessage }
  | { kind: "direct"; userId: string; message: DirectMessage };
