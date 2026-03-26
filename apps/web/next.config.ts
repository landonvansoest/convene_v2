import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";

// Ensure .env.local in apps/web is loaded (helps when Next is started via npm --prefix).
loadEnvConfig(path.join(__dirname));

const nextConfig: NextConfig = {
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
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
