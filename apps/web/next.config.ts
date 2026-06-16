import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arago/db", "@arago/ai", "@arago/validators", "@arago/test-utils"],
  // typedRoutes disabled during incremental Phase 1 build: routes are added slice-by-slice,
  // so the link graph is intentionally incomplete and dynamic router.push(string) is used.
  // Re-enable in the final Phase 1 slice once all routes exist.
  experimental: {
    typedRoutes: false
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**"
      }
    ]
  }
};

export default nextConfig;
