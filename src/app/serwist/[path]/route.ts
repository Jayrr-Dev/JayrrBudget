import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const gitHead = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout;
const revision = gitHead.trim() || crypto.randomUUID();

const serwistRoute = createSerwistRoute({
  // Precached HTML may still include a short-lived Convex Auth JWT.
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  globPatterns: [
    ".next/static/**/*.{js,css,woff,woff2,ttf,otf}",
    "public/icon.svg",
    "public/apple-touch-icon.png",
    "public/icons/**/*.{png,svg}",
  ],
  globIgnores: ["**/*.html"],
});

export const runtime = "nodejs";

export const {
  dynamic,
  dynamicParams,
  revalidate,
  generateStaticParams,
} = serwistRoute;

export const GET = async (
  request: Request,
  context: { params: Promise<{ path: string }> },
) => {
  const response = await serwistRoute.GET(request, context);
  response.headers.set(
    "Cache-Control",
    "no-cache, no-store, must-revalidate",
  );
  return response;
};
