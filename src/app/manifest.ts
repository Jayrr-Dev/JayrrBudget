import type { MetadataRoute } from "next";

const THEME_COCOA = "#60353d";
const BACKGROUND_PINK = "#fff5f3";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jev's Budget",
    short_name: "Jev's Budget",
    description: "Personal budgeting with private statement imports",
    start_url: "/",
    display: "standalone",
    background_color: BACKGROUND_PINK,
    theme_color: THEME_COCOA,
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
