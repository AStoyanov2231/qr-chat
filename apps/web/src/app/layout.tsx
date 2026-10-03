import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { isLocalDesignPreviewHost } from "@/lib/local-design-preview";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppArrival } from "@/components/app-arrival";
import { MobileOnly } from "@/components/mobile-only";

export const metadata: Metadata = {
  title: "QR Chat | A little closer",
  description: "Scan a QR code and join the conversation around you.",
  appleWebApp: { capable: true, title: "QR Chat", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preview = isLocalDesignPreviewHost((await headers()).get("host") ?? "");
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <AppArrival><MobileOnly preview={preview}>{children}</MobileOnly></AppArrival>
        <span className="browser-edge-tint browser-edge-top" aria-hidden="true" />
        <span className="browser-edge-tint browser-edge-bottom" aria-hidden="true" />
        <Analytics />
      </body>
    </html>
  );
}
