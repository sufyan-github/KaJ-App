import type { NextConfig } from "next";

import { API_CSP, staticHeaders } from "./lib/security-headers.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Dev server only. Next already allows localhost; both hosts are listed so
  // the console works whichever one the browser was opened with.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async headers() {
    const base = staticHeaders(process.env.NODE_ENV === "production");
    return [
      { source: "/:path*", headers: base },
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: API_CSP },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
