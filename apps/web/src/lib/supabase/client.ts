import { createObservedFetch, type RequestObserver } from "@qr-chat/api";
import type { Database } from "@qr-chat/types";
import { createBrowserClient } from "@supabase/ssr";

export function createClient(observer?: RequestObserver) {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: createObservedFetch(fetch, observer) } },
  );
}
