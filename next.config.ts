import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next infer the wrong workspace root.
  turbopack: { root: import.meta.dirname },
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
