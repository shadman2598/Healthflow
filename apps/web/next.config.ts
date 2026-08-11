import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fresh dist dir avoids locked/corrupt .next / .next-dev caches that caused 500s.
  distDir: ".next-app",
  // Force CJS entry — Turbopack often reports ESM react-hook-form as "no exports".
  transpilePackages: ["react-hook-form"],
  experimental: {
    turbo: {
      resolveAlias: {
        "react-hook-form": "react-hook-form/dist/index.cjs.js"
      }
    }
  },
  async rewrites() {
    // Prefix avoids collisions with App Router pages like /appointments, /messages, /resources.
    // Browser stays same-origin so auth cookies work on 127.0.0.1 (not cross-site vs localhost).
    return [
      {
        source: "/api/backend/:path*",
        destination: `${API_ORIGIN}/:path*`
      }
    ];
  }
};

export default nextConfig;
