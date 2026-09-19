import { SerwistAppProvider } from "@/components/pwa/SerwistAppProvider";
import { Providers } from "@/shared/query/Providers";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Azeret_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const THEME_COCOA = "#60353d";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans-body",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jayrrbudgets.com"),
  applicationName: "Jev's Budget",
  title: "Jev's Budget",
  description: "Personal budgeting with private statement imports",
  appleWebApp: {
    capable: true,
    title: "Jev's Budget",
    statusBarStyle: "default",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COCOA,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${outfit.variable} ${azeretMono.variable} h-dvh max-h-dvh overflow-hidden antialiased`}
    >
      <body className="flex h-full min-h-0 flex-col overflow-hidden">
        <SerwistAppProvider>
          <ConvexAuthNextjsServerProvider>
            <Providers>{children}</Providers>
          </ConvexAuthNextjsServerProvider>
        </SerwistAppProvider>
        <Analytics />
      </body>
    </html>
  );
}
