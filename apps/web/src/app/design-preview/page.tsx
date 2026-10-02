import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DesignPreview } from "@/components/design-preview";
import { isLocalDesignPreviewHost } from "@/lib/local-design-preview";

export default async function DesignPreviewPage({ searchParams }: PageProps<"/design-preview">) {
  const host = (await headers()).get("host") ?? "";
  if (!isLocalDesignPreviewHost(host)) notFound();
  const params = await searchParams;
  // This dynamic server page seeds sample timestamps once per request.
  // eslint-disable-next-line react-hooks/purity
  const initialTime = Date.now();
  return <DesignPreview view={params.view === "profile" ? "profile" : "chats"} initialTime={initialTime} />;
}
