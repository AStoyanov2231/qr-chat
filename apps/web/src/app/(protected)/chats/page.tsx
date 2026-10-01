import { redirect } from "next/navigation";

export default async function ChatsPage({ searchParams }: PageProps<"/chats">) {
  const { code } = await searchParams;
  redirect(typeof code === "string" ? `/?code=${encodeURIComponent(code)}` : "/");
}
