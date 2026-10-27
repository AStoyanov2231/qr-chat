import { z } from "@qr-chat/validation";

/** User-facing text for a failed action, shared by web and native. */
export function errorMessage(error: unknown) {
  // Schemas carry the actionable text (size limits, unsupported characters), so show the first issue.
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Check your input and try again.";
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|fetch failed|load failed|network(?:error| request failed)|network connection was lost|internet connection.*offline/i.test(message)) {
    return "Could not connect. Check your internet connection and try again.";
  }
  return message || "Could not connect. Please try again.";
}
