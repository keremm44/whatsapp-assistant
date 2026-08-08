import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Backend CORS allowlist includes http://localhost:3000 by default.
  // We keep the frontend self-contained and proxy no cross-origin assets here.
  images: {
    remotePatterns: [],
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
