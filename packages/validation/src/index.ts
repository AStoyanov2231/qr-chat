import { z } from "zod";
export { z };

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
  "Unsupported control character",
);
export const userIdSchema = z.uuid();
export const displayNameSchema = text(50);
/** Scanned text becomes a group key without anything private: http(s) URLs keep scheme, host and path only
 * (no credentials, query or fragment, where tickets and tokens live). Credential, contact and payment payloads
 * (WIFI:, vCard, mailto:, tel:, otpauth:, ...), other URL schemes and multi-field text (; or line breaks) are refused.
 * Keep this list in step with private.normalize_code in the database. */
const REFUSED_SCHEME = /^(?:wifi|mecard|bizcard|begin|vcard|mailto|matmsg|tel|sms|smsto|mms|geo|otpauth|upi|payto|sepa|bitcoin|ethereum|litecoin|monero|webcal|facetime|skype|whatsapp|javascript|data|file|ftp|vbscript|intent):|[;\r\n]/iu;
export function normalizeCode(value: string): string | null {
  if (/^https?:\/\//iu.test(value)) {
    try {
      const { protocol, host, pathname } = new URL(value);
      return `${protocol}//${host}${pathname.replace(/\/+$/u, "")}`;
    } catch { return null; }
  }
  if (/^gtin:\d{13}$/u.test(value)) return value;
  return REFUSED_SCHEME.test(value) ? null : value;
}
export const codeKeySchema = text(512).refine((value) => normalizeCode(value) !== null, "Unsupported QR code")
  .transform((value) => normalizeCode(value)!);
export const productNameSchema = text(100);
export const qrNameSchema = text(100).refine(
  (value) => !/\p{Cc}/u.test(value),
  "Unsupported control character",
);
export const qrNameLookupRequestSchema = z.strictObject({ code: codeKeySchema });
export const qrNameLookupResponseSchema = z.strictObject({ name: qrNameSchema.nullable() });
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
export const placeNameSchema = text(100);
/** A venue link opens in a browser tab, so only https URLs are accepted (no javascript: or data:). Same rule as the DB check on link_url. */
export const placeLinkSchema = z.string().trim().max(2048).refine((value) => !value || /^https:\/\/\S+$/u.test(value), "Enter a link that starts with https://");
export const MENU_MAX_BYTES = 10 * 1024 * 1024;
export const menuUploadSchema = z.strictObject({
  uploadId: userIdSchema,
  data: z.instanceof(ArrayBuffer)
    .refine((data) => data.byteLength > 0 && data.byteLength <= MENU_MAX_BYTES, 'Choose a PDF smaller than 10 MB.')
    .refine((data) => new TextDecoder().decode(data.slice(0, 5)) === '%PDF-', 'Choose a valid PDF file.'),
});
/** Report reasons in display order; the keys match the DB check on reports.reason. */
export const reportReasons = { spam: "Spam or scam", harassment: "Harassment or hate", inappropriate: "Nudity or violence", other: "Something else" } as const;
export type ReportReason = keyof typeof reportReasons;
export const reportSchema = z.strictObject({
  reason: z.enum(Object.keys(reportReasons) as [ReportReason, ...ReportReason[]]),
  details: z.string().trim().max(500),
});
export const pageSchema = z.strictObject({
  before: z.number().int().positive().safe().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
