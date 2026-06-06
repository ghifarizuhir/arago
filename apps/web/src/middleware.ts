import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@arago/validators";

const publicPaths = ["/login", "/register", "/api/auth/register", "/api/auth"];

const roleRoutes: Record<UserRole, string[]> = {
  teacher: ["/dashboard", "/assessments", "/classes", "/api/assessments", "/api/classes"],
  student: ["/dashboard", "/assessments", "/api/assessments"],
  admin: ["/dashboard", "/admin", "/assessments", "/classes", "/users", "/api/assessments", "/api/classes", "/api/users", "/api/admin"],
};

function isPublicPath(pathname: string): boolean {
  return publicPaths.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role as UserRole | undefined;

  if (isPublicPath(pathname)) {
    if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (userRole && roleRoutes[userRole]) {
    const allowed = roleRoutes[userRole].some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );
    if (!allowed && !isPublicPath(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};