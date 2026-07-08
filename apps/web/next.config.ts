import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@workspace/ui"],
  // ltxmlts (under openxmlsdkts) imports node:fs at module top level for its
  // load-from-file helpers, which the browser never calls — stub it out of
  // client bundles for both bundlers.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/fs-stub.ts" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
