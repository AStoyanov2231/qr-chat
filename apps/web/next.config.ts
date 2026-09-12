import type { NextConfig } from "next";

const phonePreviewOrigin = process.env.NEXT_PUBLIC_APP_URL;
const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: phonePreviewOrigin
    ? [new URL(phonePreviewOrigin).hostname]
    : [],
};

export default nextConfig;
