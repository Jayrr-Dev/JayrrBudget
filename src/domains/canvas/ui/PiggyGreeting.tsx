"use client";

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
  return text.split(/([!?]+|\.{2,})/g).map((chunk, index) => {
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
    if (chunk.startsWith("..")) {
      return (
        <span key={index} className={styles.dots}>
          {chunk}
        </span>
      );
    }
    return chunk;
  });
}

export function PiggyGreeting({ paused = false }: { paused?: boolean }) {
  const [shown, setShown] = useState("");
  const target = useRef("Hello!");
  const shownRef = useRef("");

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (paused) return;
    let timer = 0;
    let mode: "type" | "hold" | "delete" = shownRef.current.length > 0 ? "hold" : "type";

    const tick = () => {
      const current = shownRef.current;
      if (mode === "type") {
        if (current.length >= target.current.length) {
          mode = "hold";
          timer = window.setTimeout(tick, nextHoldMs());
          return;
        }
        setShown(target.current.slice(0, current.length + 1));
        timer = window.setTimeout(tick, TYPE_MS);
        return;
      }
      if (mode === "hold") {
        mode = "delete";
        timer = window.setTimeout(tick, DELETE_MS);
        return;
      }
      if (current.length === 0) {
        target.current = pickGreeting(target.current);
        mode = "type";
        timer = window.setTimeout(tick, GAP_MS);
        return;
      }
      setShown(current.slice(0, -1));
      timer = window.setTimeout(tick, DELETE_MS);
    };

    timer = window.setTimeout(tick, mode === "hold" ? nextHoldMs() : TYPE_MS);
    return () => window.clearTimeout(timer);
  }, [paused]);

  return (
    <span className={styles.slot} aria-hidden="true">
      <span className={styles.line}>
        {renderMarks(shown)}
        <span className={styles.caret} />
      </span>
    </span>
  );
}
