import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder. Without it, a stray package-lock.json
  // higher up (e.g. in the home folder) makes Next pick the wrong root.
  turbopack: { root: __dirname },
  devIndicators: false,
};

export default nextConfig;
