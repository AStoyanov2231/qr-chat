import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileOnly } from "@/components/mobile-only";

export const metadata: Metadata = {
  title: "QR Chat | A little closer",
  description: "Scan a QR code and join the conversation around you.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><MobileOnly>{children}</MobileOnly></body>
    </html>
  );
}
