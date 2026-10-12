import { Suspense } from "react";
import QrChatApp from "@/components/mobile-chat";
import { ChatSessionProvider } from "@/hooks/use-chat-backend";

// Static shell: the session provider redirects signed-out visitors and RLS guards every read.
export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <ChatSessionProvider><Suspense><QrChatApp /></Suspense>{children}</ChatSessionProvider>;
}
