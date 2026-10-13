import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next infer the wrong workspace root.
  turbopack: {
    root: import.meta.dirname,
    // The browser bundle gets no locale strings; each page layout provides its
    // one locale (lib/locale-data/registry.ts). Server, SSR and tests keep the
    // real module with every locale.
    resolveAlias: { "@/lib/locale-data/all": { browser: "./lib/locale-data/browser.ts" } },
  },
  // The vendored backend packages ship TypeScript sources (main: ./src/index.ts),
  // so Next has to compile them as part of the app bundle.
  transpilePackages: [
    "@sme-scanner/scoring",
    "@sme-scanner/region",
    "@sme-scanner/scan-engine",
    "@sme-scanner/contracts",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }],
  },
};

export default nextConfig;
