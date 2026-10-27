import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Security headers sent on every response. The Content-Security-Policy is set per request in src/proxy.ts
// because it carries a fresh nonce; that is also why Cache Components / partial prerendering are off
// (Next.js can't add nonces to prerendered static shells, and this staff-only app gains little from them).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@ezly/auth", "@ezly/core", "@ezly/rating", "@ezly/store"],
  experimental: {
    // Client imports send up to 10,000 rows in one request; everything else stays far below this.
    serverActions: { bodySizeLimit: "8mb" },
  },
  // Native password-hashing module: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
