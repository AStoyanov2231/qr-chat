import type { NextConfig } from "next";

const phonePreviewOrigin = process.env.NEXT_PUBLIC_APP_URL;
const development = process.env.NODE_ENV === "development";
// Loopback hosts only; production builds get no preview rewrites at all.
const localHost = [{ type: "host" as const, value: "(localhost|127\\.0\\.0\\.1)" }];
const previewRewrites = development
  ? [
    { source: "/", destination: "/design-preview?view=chats", has: localHost },
    { source: "/profile", destination: "/design-preview?view=profile", has: localHost },
    { source: "/sign-in", destination: "/design-preview?view=chats", has: localHost },
  ]
  : [];
const nextConfig: NextConfig = {
  devIndicators: false,
  // page.dev.tsx routes (the design preview) exist only on the dev server; production serves a static 404.
  pageExtensions: development ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  allowedDevOrigins: phonePreviewOrigin
    ? [new URL(phonePreviewOrigin).hostname]
    : [],
  // Routing-layer redirect: no function runs for legacy /chats links.
  async redirects() {
    return [{ source: "/chats", destination: "/", permanent: false }];
  },
  async rewrites() {
    return { beforeFiles: previewRewrites, afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
