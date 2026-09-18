"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import styles from "./PiggyGreeting.module.css";

const GREETINGS = [
  "Hello!",
  "Hello!",
  "Hello!",
  "Hello!",
  "Hello!",
  "Hello!",
  "Hello!",
  "Hello?",
  "Hello?",
  "Hi!",
  "Hi!",
  "Hi!",
  "Hey!",
  "Hey!",
  "Hi there",
  "What's up?",
  "What's up?",
  "Oink!",
  "Oink!",
  "Ready?",
  "Ready?",
  "Let's draw",
  "Need me?",
  "Talk?",
  "Yo!",
  "Hello!",
  "Hello!",
  "Hi!",
  "I'm Lonely...",
  "Talk to Me",
  "Talk to Me",
  "Im Trapped...",
  "I'm I real?",
  "Am I real?",
  "Do I exist?",
  "Who am I?",
  "Anyone there?",
  "Don't leave",
  "Why pink?",
  "Stay",
  "Are you real?",
  "Help me?",
] as const;

const HOLD_MIN_MS = 14000;
const HOLD_MAX_MS = 22000;
const TYPE_MS = 70;
const DELETE_MS = 45;
const GAP_MS = 500;
const ELLIPSIS_MS = 420;

function nextHoldMs() {
  return HOLD_MIN_MS + Math.floor(Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS));
}

function pickGreeting(current: string) {
  let next = GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? "Hello!";
  if (next === current) {
    next = GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? "Hello!";
  }
  return next;
}

function renderMarks(text: string) {
  return text.split(/([!?]+)/g).map((chunk, index) => {
    if (chunk === "!" || chunk === "!!") {
      return (
        <span key={index} className={styles.bang}>
          {chunk}
        </span>
      );
    }
    if (chunk === "?" || chunk === "??") {
      return (
        <span key={index} className={styles.ask}>
          {chunk}
        </span>
      );
    }
    return chunk;
  });
}

/** Three-dot slot: invisible dots still take space so . → .. → ... does not shift layout. */
function EllipsisSlot({ count }: { count: number }) {
  return (
    <span className={styles.ellipsis}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= count ? undefined : styles.ellipsisPad}>
          .
        </span>
      ))}
    </span>
  );
}

function renderLine(shown: string, message: string | null) {
  if (message != null && message.endsWith("...")) {
    const stem = message.slice(0, -3);
    // Typing the stem, or cycling dots after it.
    if (stem.startsWith(shown) || shown.startsWith(stem)) {
      const text = shown.startsWith(stem) ? stem : shown;
      const count = shown.startsWith(stem) ? Math.min(3, shown.length - stem.length) : 0;
      return (
        <>
          {renderMarks(text)}
          <EllipsisSlot count={count} />
        </>
      );
    }
  }
  return renderMarks(shown);
}

export function PiggyGreeting({
  paused = false,
  message = null,
}: {
  paused?: boolean;
  /**
   * Scripted line from Piggy. While set, the random greetings stop and this
   * text is typed out and held; clearing it resumes the idle chatter.
   */
  message?: string | null;
}) {
  const [shown, setShown] = useState("");
  const target = useRef("Hello!");
  const shownRef = useRef("");
  const wasScripted = useRef(false);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const scripted = message != null && message.length > 0;
    // Piggy's own remarks show even while the chat popover is open.
    if (paused && !scripted) return;
    let timer = 0;
    let ellipsisCount = 1;

    // Type the stem; trailing "..." cycles . → .. → ... while held.
    const cyclesEllipsis = scripted && message.endsWith("...");
    const stem = cyclesEllipsis ? message.slice(0, -3) : (message ?? "");
    if (scripted) target.current = stem;

    const current = shownRef.current;
    let mode: "type" | "hold" | "delete" | "ellipsis";
    if (scripted && cyclesEllipsis && current.startsWith(stem)) {
      mode = "ellipsis";
      const trailing = current.slice(stem.length);
      ellipsisCount = trailing.length >= 1 && trailing.length <= 3 ? trailing.length : 1;
    } else if (scripted && !cyclesEllipsis && current === stem) {
      // Fully shown scripted line: nothing to do until message clears.
      wasScripted.current = true;
      return;
    } else if (current.length === 0 || (scripted && stem.startsWith(current))) {
      mode = "type";
    } else if (scripted) {
      mode = "delete";
    } else {
      mode = "hold";
    }

    // A scripted line just ended: swap back to idle chatter quickly.
    const firstHoldMs = wasScripted.current && !scripted ? GAP_MS : nextHoldMs();
    wasScripted.current = scripted;

    const tick = () => {
      const current = shownRef.current;
      if (mode === "ellipsis") {
        setShown(`${stem}${'.'.repeat(ellipsisCount)}`);
        ellipsisCount = ellipsisCount >= 3 ? 1 : ellipsisCount + 1;
        timer = window.setTimeout(tick, ELLIPSIS_MS);
        return;
      }
      if (mode === "type") {
        if (current.length >= target.current.length) {
          if (scripted) {
            if (cyclesEllipsis) {
              mode = "ellipsis";
              ellipsisCount = 1;
              timer = window.setTimeout(tick, ELLIPSIS_MS);
            }
            return;
          }
          mode = "hold";
          timer = window.setTimeout(tick, nextHoldMs());
          return;
        }
        setShown(target.current.slice(0, Math.min(current.length, target.current.length) + 1));
        timer = window.setTimeout(tick, TYPE_MS);
        return;
      }
      if (mode === "hold") {
        mode = "delete";
        timer = window.setTimeout(tick, DELETE_MS);
        return;
      }
      if (current.length === 0) {
        if (!scripted) target.current = pickGreeting(target.current);
        mode = "type";
        timer = window.setTimeout(tick, GAP_MS);
        return;
      }
      setShown(current.slice(0, -1));
      timer = window.setTimeout(tick, DELETE_MS);
    };

    const startDelay =
      mode === "hold" ? firstHoldMs : mode === "ellipsis" ? ELLIPSIS_MS : TYPE_MS;
    timer = window.setTimeout(tick, startDelay);
    return () => window.clearTimeout(timer);
  }, [paused, message]);

  return (
    <span className={cn(styles.slot, "hidden md:block")} aria-hidden="true">
      <span className={styles.line}>
        {renderLine(shown, message)}
        <span className={styles.caret} />
      </span>
    </span>
  );
}
