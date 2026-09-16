"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import styles from "./PiggyIdlePrompt.module.css";

const PROMPTS = [
  {
    title: "What's rattling in the bank?",
    hint: 'Try "How much did I spend on groceries last month?" or "Move Uber Eats to Food / Delivery."',
  },
  {
    title: "Want the spend story?",
    hint: 'Try "What did I spend the most on this month?" or "Break down dining vs groceries."',
  },
  {
    title: "Need a recategorize?",
    hint: 'Try "Move Uber Eats to Food / Delivery" or "Tag Amazon as shopping."',
  },
  {
    title: "Curious about cash flow?",
    hint: 'Try "How much came in versus went out last month?" or "Any unusual charges?"',
  },
  {
    title: "Looking for a habit?",
    hint: 'Try "How often do I order delivery?" or "Show my coffee spend."',
  },
] as const;

const TYPE_MS = 55;
const DELETE_MS = 12;
const HINT_PAUSE_MS = 350;
const HOLD_MS = 22000;
const GAP_MS = 400;

function Caret() {
  return <span className={styles.caret} aria-hidden="true" />;
}

export function PiggyIdlePrompt() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [caretOn, setCaretOn] = useState<"title" | "hint">("title");

  const prompt = PROMPTS[index] ?? PROMPTS[0];

  useEffect(() => {
    const current = PROMPTS[index] ?? PROMPTS[0];
    const advance = () => setIndex((value) => (value + 1) % PROMPTS.length);

    if (reduceMotion) {
      setTitle(current.title);
      setHint(current.hint);
      const timer = window.setTimeout(advance, HOLD_MS);
      return () => window.clearTimeout(timer);
    }

    const titleChars = Array.from(current.title);
    const hintChars = Array.from(current.hint);
    let timer = 0;
    let cancelled = false;

    setTitle("");
    setHint("");
    setCaretOn("title");

    const later = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const typeTitle = (count: number) => {
      setTitle(titleChars.slice(0, count).join(""));
      if (count < titleChars.length) {
        later(TYPE_MS, () => typeTitle(count + 1));
        return;
      }
      later(HINT_PAUSE_MS, () => {
        setCaretOn("hint");
        typeHint(1);
      });
    };

    const typeHint = (count: number) => {
      setHint(hintChars.slice(0, count).join(""));
      if (count < hintChars.length) {
        later(TYPE_MS, () => typeHint(count + 1));
        return;
      }
      later(HOLD_MS, () => deleteHint(hintChars.length));
    };

    const deleteHint = (count: number) => {
      setHint(hintChars.slice(0, count).join(""));
      if (count > 0) {
        later(DELETE_MS, () => deleteHint(count - 1));
        return;
      }
      setCaretOn("title");
      later(DELETE_MS, () => deleteTitle(titleChars.length));
    };

    const deleteTitle = (count: number) => {
      setTitle(titleChars.slice(0, count).join(""));
      if (count > 0) {
        later(DELETE_MS, () => deleteTitle(count - 1));
        return;
      }
      later(GAP_MS, advance);
    };

    later(TYPE_MS, () => typeTitle(1));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [index, reduceMotion]);

  return (
    <div className={styles.slot}>
      <p className="font-medium">
        {title}
        {caretOn === "title" && !reduceMotion ? <Caret /> : null}
      </p>
      {hint || caretOn === "hint" ? (
        <p className="mt-1.5 text-xs leading-relaxed">
          {hint}
          {caretOn === "hint" && !reduceMotion ? <Caret /> : null}
        </p>
      ) : null}
    </div>
  );
}
