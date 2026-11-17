import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds a fully static site into `out/` (used for GitHub Pages).
// NEXT_PUBLIC_BASE_PATH serves the app from a sub-path, e.g. "/domaxing" on username.github.io/domaxing.
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  // Lets a second build run next to a live dev server without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  ...(isStatic
    ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
    : {
        async headers() {
          return [
            {
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
                { key: "Service-Worker-Allowed", value: "/" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
