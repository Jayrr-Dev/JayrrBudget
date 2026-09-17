import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/serwist/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/~offline",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/login", destination: "/sign-in", permanent: true },
      { source: "/signin", destination: "/sign-in", permanent: true },
      { source: "/account", destination: "/accounts", permanent: true },
      { source: "/transaction", destination: "/transactions", permanent: true },
      { source: "/statement", destination: "/statements", permanent: true },
      { source: "/merchant", destination: "/merchants", permanent: true },
      { source: "/classification", destination: "/classifications", permanent: true },
      { source: "/vault", destination: "/profile", permanent: false },
      { source: "/private-vault", destination: "/profile", permanent: false },
    ];
  },
  transpilePackages: ["jayrr-draw"],
  serverExternalPackages: ["tesseract.js"],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default withSerwist(nextConfig);
