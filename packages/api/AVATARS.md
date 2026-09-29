# Avatar storage

Configured on the shared Supabase backend through MCP migration `20260929225624_user_avatar_uploads`. This migration adds Storage metadata/policies; public database TypeScript types were regenerated and match the existing file.

- Public bucket `avatars`, maximum file size 2 MB, allowed MIME type `image/jpeg`.
- New uploads use `<authenticated-user-id>/<fresh-UUID>.jpg`; immutable keys avoid stale cached replacements. No upsert or object update policy.
- Authenticated INSERT, SELECT, and DELETE policies restrict the first folder to `auth.uid()`. Insert also restricts the extension to `jpg`. Public image serving requires no session; bucket listing remains restricted to the owner.
- Web accepts JPEG/PNG/WebP up to 20 MB and crops the center to a 512 px square JPEG. Native uses the system image picker/crop UI and Expo ImageManipulator to produce a 512 px square JPEG. Shared validation checks JPEG signature, size, and upload UUID.
- The API uploads first, saves the profile URL, then removes the previously referenced custom photo from the same user's folder. Provider URLs and unknown paths are never deleted.
- Failed or ambiguous profile responses retain the uploaded file because the write may have committed. Cleanup failure does not fail a committed save. These failures can leave unused objects; automatic orphan/account-deletion cleanup is not implemented.
- Omitting a photo from a name edit keeps the current avatar. Removing it stores `avatar_url = null` and falls back to initials.

Verification: bucket and policy definitions inspected through MCP; security advisor found no Storage/RLS issues. The existing Auth warning about disabled leaked-password protection remains outside this change. Unit tests cover upload order, limits, failure preservation, removal, and cleanup scope. Authenticated uploads and camera/photo pickers on physical devices require separate live verification.
