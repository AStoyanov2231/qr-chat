/** Only the development server on loopback serves the account-free design preview. */
function isLocalDesignPreview(hostname: string): boolean {
  return process.env.NODE_ENV === "development"
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}

export function isLocalDesignPreviewHost(host: string): boolean {
  try { return isLocalDesignPreview(new URL(`http://${host}`).hostname); } catch { return false; }
}
