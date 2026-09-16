import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["jayrr-draw"],
  serverExternalPackages: ["tesseract.js"],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
