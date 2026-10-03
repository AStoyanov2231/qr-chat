import { ChatSessionProvider } from "@/hooks/use-chat-backend";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    redirect("/sign-in");
  }

  return <ChatSessionProvider>{children}</ChatSessionProvider>;
}
