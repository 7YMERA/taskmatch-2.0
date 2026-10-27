import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder. Without it, a stray package-lock.json
  // higher up (e.g. in the home folder) makes Next pick the wrong root.
  turbopack: { root: __dirname },
  devIndicators: false,
  // The roster used to live at /students. Keep old bookmarks and shared links working.
  async redirects() {
    return [
      { source: "/students", destination: "/people", permanent: true },
      { source: "/students/:id", destination: "/people/:id", permanent: true },
    ];
  },
};

export default nextConfig;
