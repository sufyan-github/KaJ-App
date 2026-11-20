import { NextRequest, NextResponse } from "next/server";

import { pageCsp, storageOrigins } from "./lib/security-headers.ts";

/** A fresh nonce and CSP for every page request (see lib/security-headers). */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = pageCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    storage: storageOrigins(process.env),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
