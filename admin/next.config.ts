import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Dev server only. Next already allows localhost; both hosts are listed so
  // the console works whichever one the browser was opened with.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
