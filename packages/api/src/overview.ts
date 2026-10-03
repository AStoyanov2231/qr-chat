import type { Tables } from "@qr-chat/types";

export type Profile = Tables<"profiles">;
export type Friend = Tables<"friend_connections"> & { user_a: Profile | null; user_b: Profile | null };
export type Membership = Tables<"group_memberships"> & { qr_groups: (Tables<"qr_groups"> & { qr_codes: Tables<"qr_codes"> | null }) | null };
export type Member = Tables<"group_memberships"> & { profiles: Profile | null };
export type GroupMessage = Tables<"group_messages"> & { profiles: Pick<Profile, "display_name" | "avatar_url"> | null };
export type ChatOverview = {
  userId: string;
  profile: Profile | null;
  membership: Membership | null;
  members: Member[];
  friends: Friend[];
  directPreviews: Record<string, Tables<"direct_messages"> | null>;
  groupHeadIds: number[];
  groupPreview: GroupMessage | null;
};
export type ChatAccess = { userId: string; membership: Pick<Tables<"group_memberships">, "group_id" | "expires_at"> | null; acceptedConnectionIds: string[] };
export type ChatMutation =
  | { kind: "overview" }
  | { kind: "group"; userId: string; message: GroupMessage }
  | { kind: "direct"; userId: string; message: Tables<"direct_messages"> };
