import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { safeRedirect } from "@/lib/utils";

const WEBHOOK_PATH = "/api/billing/webhook";

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Sends signed-out visitors to the login screen and signed-in ones away from it. This is only
 * the navigation layer: the app layout and every API route check the session themselves.
 */
export default clerkMiddleware(async (auth, request) => {
  const { isAuthenticated } = await auth();
  const { pathname, search, searchParams } = request.nextUrl;

  if (within(pathname, "/login")) {
    // The OAuth callback under /login/ still has to finish, so only the login screen redirects.
    if (isAuthenticated && pathname === "/login") {
      return NextResponse.redirect(new URL(safeRedirect(searchParams.get("next")), request.url));
    }
    return;
  }
  if (isAuthenticated) return;

  // Stripe calls the webhook server-to-server: it carries a signature instead of a session.
  if (pathname === WEBHOOK_PATH) return;
  if (within(pathname, "/api")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    // Everything except Next.js internals and static files (the voice previews included).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3)).*)",
    "/api(.*)",
  ],
};
