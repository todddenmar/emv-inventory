import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jose v6 is ESM-only; jwks-rsa (via firebase-admin) still require()s it.
  // Pin jose@5 under jwks-rsa via package.json overrides for Vercel/Node CJS.
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
};

export default nextConfig;
