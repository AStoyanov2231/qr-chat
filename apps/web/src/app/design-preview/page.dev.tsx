import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BusinessPreview, DesignPreview } from "@/components/design-preview";
import { isLocalDesignPreviewHost } from "@/lib/local-design-preview";

export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const host = (await headers()).get("host") ?? "";
  if (!isLocalDesignPreviewHost(host)) notFound();
  const params = await searchParams;
  // This dynamic server page seeds sample timestamps once per request.
  // eslint-disable-next-line react-hooks/purity
  const initialTime = Date.now();
  if (params.view === "business") return <BusinessPreview initialTime={initialTime} />;
  return <DesignPreview view={params.view === "profile" ? "profile" : "chats"} initialTime={initialTime} />;
}
