"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestion,
  NotebookPen,
  PanelsTopLeft,
  PenTool,
  PiggyBank,
  Save,
  Sparkles,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { PiggyMascot, type PiggyMood } from "./PiggyMascot";

export type PiggyFeatureSlide = {
  id: string;
  mood: PiggyMood;
  badge: { icon: LucideIcon; label: string };
  title: string;
  /** Small pills that pop into the stage next to Piggy. */
  chips: readonly string[];
  features: readonly { icon: LucideIcon; label: string }[];
};

export const PIGGY_FEATURE_SLIDES: readonly PiggyFeatureSlide[] = [
  {
    id: "advice",
    mood: "happy",
    badge: { icon: Sparkles, label: "Budget advice" },
    title: "Answers from your real numbers",
    chips: ["Groceries $420", "Rent $1,600", "Saved $310"],
    features: [
      { icon: TrendingUp, label: "Reads your spend, income, bills, and savings" },
      { icon: PiggyBank, label: "Tells you what's safe to spend this month" },
    ],
  },
  {
    id: "crew",
    mood: "excited",
    badge: { icon: Users, label: "Helper piggies" },
    title: "Hires up to two helpers",
    chips: ["Piggy", "Helper 1", "Helper 2"],
    features: [
      { icon: Users, label: "Splits big jobs across a small crew" },
      { icon: MessageCircleQuestion, label: "They talk through your private crew mail" },
    ],
  },
  {
    id: "tidy",
    mood: "thinking",
    badge: { icon: Tags, label: "Tidy transactions" },
    title: "Recategorizes and reshapes buckets",
    chips: ["Food → Dining", "Coffee shops", "Transfers"],
    features: [
      { icon: Tags, label: "Moves rows to the right category" },
      { icon: Layers, label: "Edits sections, categories, and subcategories" },
    ],
  },
  {
    id: "notes",
    mood: "neutral",
    badge: { icon: NotebookPen, label: "Store sheet and notes" },
    title: "Keeps your notes current",
    chips: ["Store sheet", "Scratch note", "Reminder"],
    features: [
      { icon: FileSpreadsheet, label: "Reads and updates your store sheet" },
      { icon: NotebookPen, label: "Edits freeform notes on request" },
    ],
  },
  {
    id: "ask",
    mood: "confused",
    badge: { icon: MessageCircleQuestion, label: "Asks when unsure" },
    title: "Never guesses on your behalf",
    chips: ["A. Dining", "B. Groceries", "C. Skip"],
    features: [
      { icon: ListChecks, label: "Sends a quick multiple-choice question" },
      { icon: Sparkles, label: "Continues once you pick" },
    ],
  },
  {
    id: "files",
    mood: "love",
    badge: { icon: Download, label: "Files you can keep" },
    title: "Builds CSV or PDF downloads",
    chips: ["spend.csv", "report.pdf"],
    features: [
      { icon: FileSpreadsheet, label: "CSV for spreadsheets" },
      { icon: FileText, label: "PDF for a clean summary" },
    ],
  },
  {
    id: "sketch",
    mood: "surprised",
    badge: { icon: PenTool, label: "Sketches" },
    title: "Pictures a split or a money flow",
    chips: ["Income", "→ Bills", "→ Savings"],
    features: [
      { icon: PenTool, label: "Draws a sketch in chat when a picture helps" },
      { icon: TrendingUp, label: "Totals spend by merchant or category" },
    ],
  },
  {
    id: "tabs",
    mood: "sleepy",
    badge: { icon: PanelsTopLeft, label: "Tabs and saving" },
    title: "Separate chats, saved for you",
    chips: ["Piggy", "Piggy 2", "Piggy 3"],
    features: [
      { icon: PanelsTopLeft, label: "Open extra tabs for separate chats" },
      { icon: Save, label: "Chats and drafts stay on this browser" },
    ],
  },
];

const AUTOPLAY_MS = 4200;
const SLIDE_TRANSITION = { duration: 0.32, ease: "easeInOut" } as const;
const STAGGER_S = 0.08;

/**
 * Auto-advancing feature tour styled after the front-page product showcase.
 * Pauses on hover/focus; arrows and dots let the user drive it.
 */
export function PiggyFeatureCarousel({
  slides = PIGGY_FEATURE_SLIDES,
  className,
}: {
  slides?: readonly PiggyFeatureSlide[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;

  const go = (next: number, dir: number) => {
    setDirection(dir);
    setIndex((next + slides.length) % slides.length);
  };

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setDirection(1);
      setIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const slide = slides[index];
  if (!slide) return null;
  const BadgeIcon = slide.badge.icon;

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Piggy features"
    >
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={slide.id}
            custom={direction}
            initial={animate ? { opacity: 0, x: 24 * direction } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animate ? { opacity: 0, x: -24 * direction } : undefined}
            transition={SLIDE_TRANSITION}
            className="grid gap-2.5"
            aria-live="polite"
          >
            <Badge variant="secondary" className="w-fit gap-1.5">
              <BadgeIcon />
              {slide.badge.label}
            </Badge>

            {/* Stage */}
            <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-br from-accent-subtle/80 via-background to-background p-3">
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-accent/15 blur-2xl"
                animate={animate ? { scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] } : undefined}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative flex items-center gap-3">
                <motion.div
                  animate={animate ? { y: [0, -4, 0], rotate: [0, -3, 0, 3, 0] } : undefined}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="shrink-0 rounded-full bg-background/80 p-1.5 shadow-sm ring-1 ring-foreground/10"
                >
                  <PiggyMascot mood={slide.mood} iconClassName="size-12" />
                </motion.div>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {slide.chips.map((chip, i) => (
                    <motion.span
                      key={chip}
                      initial={animate ? { opacity: 0, scale: 0.7, y: 6 } : false}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 22,
                        delay: 0.18 + i * STAGGER_S,
                      }}
                      className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-foreground shadow-sm"
                    >
                      {chip}
                    </motion.span>
                  ))}
                </div>
              </div>
            </div>

            <p className="type-label text-base leading-tight text-foreground">{slide.title}</p>

            <ul className="space-y-1.5">
              {slide.features.map(({ icon: Icon, label }, i) => (
                <motion.li
                  key={label}
                  initial={animate ? { opacity: 0, x: -8 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.24 + i * STAGGER_S }}
                  className="flex items-start gap-2 text-muted-foreground"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="leading-snug">{label}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(index - 1, -1)}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent-subtle hover:text-accent"
          aria-label="Previous feature"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Piggy feature tour">
          {slides.map((item, i) => {
            const selected = i === index;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={item.title}
                onClick={() => go(i, i > index ? 1 : -1)}
                className="flex min-h-6 items-center"
              >
                <motion.span
                  className="relative block h-1.5 overflow-hidden rounded-full"
                  animate={{
                    width: selected ? 20 : 6,
                    backgroundColor: selected ? "var(--accent-subtle)" : "var(--border)",
                  }}
                  transition={{ duration: 0.25 }}
                >
                  {selected && (
                    // Remounts on slide change or pause toggle so the fill restarts in step with the timer.
                    <motion.span
                      key={`${item.id}-${paused}`}
                      className="absolute inset-y-0 left-0 rounded-full bg-accent"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: paused || !animate ? 0 : AUTOPLAY_MS / 1000,
                        ease: "linear",
                      }}
                    />
                  )}
                </motion.span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => go(index + 1, 1)}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent-subtle hover:text-accent"
          aria-label="Next feature"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
