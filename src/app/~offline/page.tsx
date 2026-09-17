"use client";

import dynamic from "next/dynamic";

const OfflineFallbackView = dynamic(
  () =>
    import("./offlineFallbackView").then((mod) => mod.OfflineFallbackView),
  { ssr: false },
);

export default function OfflineFallbackPage() {
  return <OfflineFallbackView />;
}
