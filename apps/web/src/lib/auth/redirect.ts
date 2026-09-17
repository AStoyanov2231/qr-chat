const DEFAULT_AUTH_DESTINATION = "/";

export function safeAuthDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) {
    return DEFAULT_AUTH_DESTINATION;
  }

  const base = new URL("https://qr-chat.invalid");
  const destination = new URL(value, base);

  if (destination.origin !== base.origin) {
    return DEFAULT_AUTH_DESTINATION;
  }

  if (
    destination.pathname.startsWith("/auth/")
    || destination.pathname.startsWith("/sign-in")
  ) {
    return DEFAULT_AUTH_DESTINATION;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
