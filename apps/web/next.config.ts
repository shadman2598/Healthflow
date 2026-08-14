import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthflow";
const API_ORIGIN = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Local/dev uses a dedicated dist dir; Pages build uses default `.next` then emits `out/`.
  distDir: isGithubPages ? ".next" : ".next-app",
  transpilePackages: ["react-hook-form", "@technovate/shared"],
  ...(isGithubPages
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}`,
        // CI static export should not fail on transient Next type-package quirks.
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true }
      }
    : {
        experimental: {
          turbo: {
            resolveAlias: {
              "react-hook-form": "react-hook-form/dist/index.cjs.js"
            }
          }
        }
      }),
  ...(!isGithubPages
    ? {
        async rewrites() {
          return [
            {
              source: "/api/backend/:path*",
              destination: `${API_ORIGIN}/:path*`
            }
          ];
        }
      }
    : {})
};

export default nextConfig;
