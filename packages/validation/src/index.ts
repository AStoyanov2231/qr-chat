import { z } from "zod";
export { z };

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
  "Unsupported control character",
);
export const userIdSchema = z.uuid();
export const displayNameSchema = text(50);
export const codeKeySchema = text(512);
export const qrNameSchema = text(100).refine(
  (value) => !/\p{Cc}/u.test(value),
  "Unsupported control character",
);
export const qrNameLookupRequestSchema = z.strictObject({ code: codeKeySchema });
export const qrNameLookupResponseSchema = z.strictObject({ name: qrNameSchema.nullable(), imageUrl: z.url().max(2048).refine((url) => url.startsWith("https://")).nullable().optional() });
export const messageBodySchema = text(4000);
export const profileSchema = z.strictObject({
  display_name: displayNameSchema,
  avatar_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/).nullable().optional(),
});
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const avatarUploadSchema = z.strictObject({
  uploadId: userIdSchema,
  data: z.instanceof(ArrayBuffer)
    .refine((data) => data.byteLength > 0 && data.byteLength <= AVATAR_MAX_BYTES, 'Choose a photo smaller than 2 MB.')
    .refine((data) => {
      const bytes = new Uint8Array(data);
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }, 'Choose a valid JPEG photo.'),
});
export const pageSchema = z.strictObject({
  before: z.number().int().positive().safe().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
