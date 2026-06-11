import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";

// Ensure .env.local in apps/web is loaded (helps when Next is started via npm --prefix).
loadEnvConfig(path.join(__dirname));

/** Daily Prebuilt runs in a cross-origin iframe; (self)-only Permissions-Policy blocks getUserMedia inside it. */
function permissionsPolicyValue(): string {
  const raw =
    process.env.DAILY_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_DAILY_DOMAIN?.trim() ||
    "videodemo.daily.co";
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0] ?? "videodemo.daily.co";
  const dailyOrigin = `https://${host}`;
  return `camera=(self "${dailyOrigin}"), microphone=(self "${dailyOrigin}"), display-capture=(self "${dailyOrigin}"), geolocation=()`;
}

const nextConfig: NextConfig = {
  // Work around Next 15 dev-tools segment-explorer runtime bug in local dev.
  devIndicators: false,
  // Smaller client chunks; fewer lazy-load edge cases with icon packages
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Monorepo: trace files from repo root when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: permissionsPolicyValue(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
