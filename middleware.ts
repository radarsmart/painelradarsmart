import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const WWW_HOST = "www.radarsmart.com.br";
const CANONICAL_HOST = "radarsmart.com.br";

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname !== WWW_HOST) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.protocol = "https:";
  redirectUrl.port = "";

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/:path*"],
};
