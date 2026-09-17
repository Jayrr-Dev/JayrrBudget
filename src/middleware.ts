import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";

const isSignInPage = createRouteMatcher(["/sign-in"]);
const isPublicApi = createRouteMatcher(["/api/auth(.*)"]);
const isOfflineFallback = createRouteMatcher(["/~offline"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isPublicApi(request)) {
    return;
  }
  if (isOfflineFallback(request)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
  if (!isSignInPage(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
