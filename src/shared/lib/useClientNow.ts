"use client";

import { useEffect, useState } from "react";

/** Snapshot of `Date.now()` after mount. Undefined on the first render. */
export function useClientNow(): number | undefined {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}
