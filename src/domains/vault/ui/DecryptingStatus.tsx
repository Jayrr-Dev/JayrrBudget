"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";
import styles from "./DecryptingStatus.module.css";

export function DecryptingStatus({ label = "Decrypting" }: { label?: string }) {
  const rawId = useId();
  const clipId = `coin-slot-${rawId.replaceAll(":", "")}`;

  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label={`${label}…`}>
      <svg
        className={styles.art}
        viewBox="0 0 128 128"
        fill="none"
        aria-hidden
      >
        <g
          stroke="#60353d"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
          transform="matrix(.85 0 0 1 9.6 0)"
        >
          <path d="M106 74c17 4 20-16 10-15-8 1-4 11 3 7" />
          <path
            fill="#f8c3cc"
            stroke="none"
            d="M32 53c-4-5-4-14 2-14 7 0 13 3 15 7 14-6 31-6 44 1 14 8 21 23 16 39q-3 13-14 18l-1 10H81l-3-6q-13 3-26-2l-4 8H35l-1-14q-10-6-12-15h-6q-6 0-6-6V68q0-6 7-6h5q4-6 10-9"
          />
          <path
            fill="#eca5b7"
            stroke="none"
            d="M32 53c-4-5-4-14 2-14 7 0 13 3 15 7q-9.5 5-17 7m2 40q30 22 61 4 9-7 13-19 6 18-13 26l-1 10H81l-3-6q-13 3-26-2l-4 8H35l-1-14Z"
          />
          <path d="M32 53c-4-5-4-14 2-14 7 0 13 3 15 7 14-6 31-6 44 1 14 8 21 23 16 39q-3 13-14 18l-1 10H81l-3-6q-13 3-26-2l-4 8H35l-1-14q-10-6-12-15h-6q-6 0-6-6V68q0-6 7-6h5q4-6 10-9" />
          <path strokeWidth="3.5" d="M16 71v5" />
          <ellipse cx="37" cy="66" fill="#60353d" stroke="none" rx="4" ry="5" />
          <circle cx="38" cy="64" r="1.2" fill="#fff5f3" stroke="none" />
          <ellipse cx="43" cy="80" fill="#ef94af" stroke="none" rx="8" ry="5" />
          <path strokeWidth="3" d="M27 86q4 3 7 0" />
          <path stroke="#ffe5e8" strokeWidth="5" d="M53 53q9-5 16-4" />
        </g>
        <defs>
          <clipPath id={clipId}>
            <path d="M0 0h128v69.32L0 50Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <g
            className={styles.coin}
            stroke="#60353d"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4.5"
            transform="translate(-9.7 12)"
          >
            <circle cx="87" cy="34" r="20" fill="#f6d588" />
            <path
              fill="#e9b85f"
              stroke="none"
              d="M91 16c18 4 20 29 2 37q-11 4-20-5c22 6 31-21 18-32"
            />
            <circle cx="87" cy="34" r="20" />
            <path stroke="#fff0cc" strokeWidth="4" d="M76 29q2-7 8-7" />
            <path strokeWidth="3.5" d="m90 25-6 17" />
          </g>
        </g>
        <path
          stroke="#60353d"
          strokeLinecap="round"
          strokeWidth="5"
          d="m58 56 32 9"
        />
      </svg>
      <p className={styles.label}>
        {label}
        <span className={styles.dots} />
      </p>
    </div>
  );
}

export function DecryptingPage({ className }: { className?: string }) {
  return (
    <div
      data-slot="decrypting-page"
      className={cn(
        "flex min-h-[16rem] w-full items-center justify-center py-16",
        className,
      )}
    >
      <DecryptingStatus />
    </div>
  );
}
