export type RequestObservation = {
  category: "auth" | "overview" | "access" | "messages" | "metadata" | "storage" | "other";
  trigger: string;
  durationMs: number;
  status: number | null;
  responseBytes: number | null;
};
export type RequestObserver = (request: RequestObservation) => void;

/** Opt-in diagnostics. No URLs, credentials, bodies, or user identifiers are emitted. */
export function createObservedFetch(fetcher: typeof fetch, observer?: RequestObserver, trigger = () => "request"): typeof fetch {
  if (!observer) return fetcher;
  return async (input, init) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://diagnostics.invalid").pathname;
    const category: RequestObservation["category"] = path.startsWith("/auth/") ? "auth"
      : path.endsWith("/get_chat_overview") ? "overview" : path.endsWith("/get_chat_access") ? "access"
      : path.endsWith("/messages") ? "messages"
      : path.endsWith("/api/qr-name") ? "metadata" : path.startsWith("/storage/") ? "storage" : "other";
    const reason = trigger();
    const start = Date.now();
    let response: Response | undefined;
    try { response = await fetcher(input, init); return response; }
    finally {
      const length = response?.headers.get("content-length");
      const bytes = length ? Number(length) : NaN;
      try { observer({ category, trigger: reason, durationMs: Date.now() - start, status: response?.status ?? null, responseBytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : null }); } catch { /* Diagnostics must not affect delivery. */ }
    }
  };
}
