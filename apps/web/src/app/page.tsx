"use client";

import { useSyncExternalStore } from "react";
import MobileChat from "@/components/mobile-chat";
import { DesktopLanding } from "@/components/desktop-landing";

function subscribe(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export default function Home() {
  const isMobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
  return isMobile ? <MobileChat /> : <DesktopLanding />;
}
