/** A callback must be the exact app URI and carry a PKCE code, never tokens. */
export function parseAuthCallback(value: string, callback: string) {
  const url = new URL(value);
  const expected = new URL(callback);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw new Error("Invalid sign-in callback.");
  if (url.searchParams.has("error")) throw new Error("Sign-in was not completed. Please try again.");
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  if (!code || code.length > 2048 || url.searchParams.getAll("code").length !== 1 || url.searchParams.has("access_token") || url.searchParams.has("refresh_token")) throw new Error("Invalid sign-in callback.");
  if (flowId !== null && (!/^[a-zA-Z0-9_-]{8,64}$/.test(flowId) || url.searchParams.getAll("sb_flow_id").length !== 1)) throw new Error("Invalid sign-in callback.");
  return { code, flowId: flowId ?? undefined };
}

/** Browser and deep-link handlers share a single exchange, regardless of query order. */
export function createSignInCompleter(callback: string, exchange: (code: string, flowId?: string) => Promise<void>) {
  let previousIdentity = '';
  let previousExchange: Promise<void> | undefined;
  return (url: string): Promise<void> => {
    const { code, flowId } = parseAuthCallback(url, callback);
    const identity = JSON.stringify([code, flowId]);
    if (identity === previousIdentity && previousExchange) return previousExchange;
    previousIdentity = identity;
    previousExchange = Promise.resolve().then(() => exchange(code, flowId));
    return previousExchange;
  };
}
