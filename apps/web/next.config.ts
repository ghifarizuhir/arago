import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arago/db", "@arago/ai", "@arago/validators", "@arago/test-utils"],
  // typedRoutes left off for Phase 1: the app navigates with runtime-dynamic targets
  // (login callbackUrl, query-string result redirects) that aren't statically typeable
  // without `as Route` casts everywhere. Routing is validated via the `next build` route
  // table instead. Re-enable + add casts as a Phase 4 polish item.
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
  },
  // The workspace packages use NodeNext ESM `.js` import specifiers that resolve to
  // `.ts` sources. tsc accepts these, but the webpack build needs to be told to try
  // `.ts`/`.tsx` when it sees a `.js` import. Mirror the same for Turbopack (dev).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"]
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"]
  }
};

export default nextConfig;
