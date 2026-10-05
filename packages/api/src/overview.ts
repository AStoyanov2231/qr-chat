import type { Tables } from "@qr-chat/types";

/** avatar_url is derived from avatar_path by the API; the database stores only the path. */
export type Profile = Tables<"profiles"> & { avatar_url: string | null };
/** expires_at is derived from joined_at by the public.expires_at computed field. */
type MembershipRow = Tables<"group_members"> & { expires_at: string };
/** A friendship's id is its DM group id; DM messages and previews are keyed by it. */
export type Friend = Tables<"friendships"> & { id: string; user_a: Profile | null; user_b: Profile | null };
export type Membership = MembershipRow & { groups: Tables<"groups"> | null };
export type Member = MembershipRow & { profiles: Profile | null };
export type DirectMessage = Tables<"messages">;
export type GroupMessage = DirectMessage & { profiles: (Pick<Profile, "display_name" | "avatar_url"> & { avatar_path?: string | null }) | null };
export type ChatOverview = {
  userId: string;
  profile: Profile | null;
  membership: Membership | null;
  members: Member[];
  friends: Friend[];
  directPreviews: Record<string, DirectMessage | null>;
  groupHeadIds: number[];
  groupPreview: GroupMessage | null;
};
export type ChatAccess = { userId: string; membership: Pick<MembershipRow, "group_id" | "expires_at"> | null; acceptedConnectionIds: string[] };
export type ChatMutation =
  | { kind: "overview" }
  | { kind: "group"; userId: string; message: GroupMessage }
  | { kind: "direct"; userId: string; message: DirectMessage };
