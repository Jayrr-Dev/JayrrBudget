"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Fastest the bubble may type, even after the model dump is already in. */
const MAX_CHARS_PER_SEC = 40;

/**
 * Reveal `source` at a capped rate once this turn has gone live.
 * Saved history (never live) snaps to the full string.
 */
export function useCappedTextReveal(source: string, live: boolean): string {
  const reduceMotion = useReducedMotion();
  const paced = useRef(live);
  if (live) paced.current = true;

  const [shown, setShown] = useState(() => (live ? "" : source));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (reduceMotion || !paced.current) {
      shownRef.current = source;
      setShown(source);
      return;
    }

    let frame = 0;
    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      carry += ((now - last) / 1000) * MAX_CHARS_PER_SEC;
      last = now;
      const add = Math.floor(carry);
      carry -= add;

      const prev = shownRef.current;
      let next: string;
      if (source.startsWith(prev)) {
        next = source.slice(0, Math.min(source.length, prev.length + add));
      } else {
        next = source.slice(0, Math.min(source.length, add > 0 ? add : 1));
      }

      if (next !== prev) {
        shownRef.current = next;
        setShown(next);
      }

      if (next.length < source.length) {
        frame = requestAnimationFrame(tick);
      }
    };

    const prev = shownRef.current;
    if (!source.startsWith(prev) || prev.length < source.length) {
      frame = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, source]);

  return shown;
}
