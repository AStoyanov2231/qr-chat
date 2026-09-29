"use client";

import Image from "next/image";
import { useState } from "react";

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="user-avatar" style={{ width: size, height: size, fontSize: size / 3 }}>
    {url && url !== failed ? <Image src={url} alt="" width={size} height={size} unoptimized onError={() => setFailed(url)} /> : name.slice(0, 2).toUpperCase() || "?"}
  </span>;
}
