import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arago/db", "@arago/ai", "@arago/validators", "@arago/test-utils"],
  // typedRoutes enabled in Phase 4: genuinely-dynamic nav targets (login callbackUrl,
  // result redirects) are cast with `as Route` from 'next'. Static hrefs are left as-is.
  typedRoutes: true,
  experimental: {},
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
