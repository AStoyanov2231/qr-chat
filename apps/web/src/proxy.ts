import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeAuthDestination } from "@/lib/auth/redirect";
import { isRouteAuthenticatedApiPath } from "@/lib/qr-name-route";
import { isLocalDesignPreviewHost } from "@/lib/local-design-preview";
import { updateSession } from "@/lib/supabase/proxy";

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  const cacheControl = from.headers.get("cache-control");
  if (cacheControl) to.headers.set("cache-control", cacheControl);
  return to;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const preview = isLocalDesignPreviewHost(request.headers.get("host") ?? "");
  if (pathname === "/design-preview") return preview ? NextResponse.next() : new NextResponse(null, { status: 404 });
  if (preview && ["/", "/chats", "/profile", "/sign-in"].includes(pathname)) {
    const url = new URL(request.url);
    url.host = request.headers.get("host") ?? url.host;
    url.pathname = "/design-preview";
    url.searchParams.set("view", pathname === "/profile" ? "profile" : "chats");
    return NextResponse.rewrite(url);
  }
  const { response, userId } = await updateSession(request);
  const isAuthRoute = pathname === "/sign-in" || pathname.startsWith("/auth/");

  if (!userId && !isAuthRoute && !isRouteAuthenticatedApiPath(pathname)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set("next", `${pathname}${search}`);
    return copyAuthCookies(response, NextResponse.redirect(signInUrl));
  }

  if (userId && pathname === "/sign-in") {
    const destination = safeAuthDestination(
      request.nextUrl.searchParams.get("next"),
    );
    return copyAuthCookies(
      response,
      NextResponse.redirect(new URL(destination, request.url)),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_vercel/insights/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
