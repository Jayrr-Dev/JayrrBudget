/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const APEX_HOST = "jevsbudget.app";
const WWW_HOST = "www.jevsbudget.app";

function isConvexHost(hostname: string) {
  return (
    hostname.endsWith(".convex.cloud") || hostname.endsWith(".convex.site")
  );
}

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isSerwistPath(pathname: string) {
  return pathname === "/serwist" || pathname.startsWith("/serwist/");
}

function isStaticShellRequest(request: Request, url: URL) {
  if (isSerwistPath(url.pathname) || request.destination === "serviceworker") {
    return false;
  }
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    return true;
  }
  return /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|ico|webp|avif)$/i.test(
    url.pathname,
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return (
            request.mode === "navigate" || request.destination === "document"
          );
        },
      },
    ],
  },
  runtimeCaching: [
    {
      matcher: ({ url }) => url.hostname === APEX_HOST,
      handler: {
        handle: async ({ request }) => {
          const url = new URL(request.url);
          url.hostname = WWW_HOST;
          return Response.redirect(url.href, 308);
        },
      },
    },
    {
      matcher: ({ url }) => isSerwistPath(url.pathname),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) =>
        isApiPath(url.pathname) || isConvexHost(url.hostname),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) =>
        request.mode === "navigate" ||
        request.destination === "document" ||
        request.headers.get("RSC") === "1",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, url }) => isStaticShellRequest(request, url),
      handler: new StaleWhileRevalidate({
        cacheName: "jayrr-static-shell",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      matcher: () => true,
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
