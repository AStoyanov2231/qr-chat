import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeAuthDestination } from "@/lib/auth/redirect";
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
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const isAuthRoute = pathname === "/sign-in" || pathname.startsWith("/auth/");

  if (!userId && !isAuthRoute) {
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
