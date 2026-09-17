import { z } from "zod";
export { z };

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
  "Unsupported control character",
);
export const userIdSchema = z.uuid();
export const displayNameSchema = text(50);
export const codeKeySchema = text(512);
export const qrNameSchema = text(100);
export const messageBodySchema = text(4000);
export const profileSchema = z.strictObject({
  display_name: displayNameSchema,
  avatar_url: z.url().max(2048).refine((url) => url.startsWith("https://")).nullable().optional(),
});
export const pageSchema = z.strictObject({
  before: z.number().int().positive().safe().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
