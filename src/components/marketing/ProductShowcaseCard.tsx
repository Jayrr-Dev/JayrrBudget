"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BarChart3,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileScan,
  Info,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  type LucideIcon,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Tags,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { AnalysisScene } from "./scenes/AnalysisScene";
import { ClassificationScene } from "./scenes/ClassificationScene";
import { EncryptionScene } from "./scenes/EncryptionScene";
import { JevClassifyScene } from "./scenes/JevClassifyScene";
import { LoansAiScene } from "./scenes/LoansAiScene";
import type { SceneProps } from "./scenes/SceneFrame";
import { StatementImportScene } from "./scenes/StatementImportScene";

type Slide = {
  id: string;
  badge: { icon: LucideIcon; label: string };
  title: string;
  info: { title: string; lead: string; bullets: readonly string[] };
  features: readonly { icon: LucideIcon; label: string }[];
  Scene: ComponentType<SceneProps>;
};

const SLIDES: readonly Slide[] = [
  {
    id: "jev-classify",
    badge: { icon: Sparkles, label: "Jev classifies" },
    title: "⚡ Jev labels every row. Fast, accurate, nothing to fix later.",
    info: {
      title: "How Jev classifies",
      lead: "Jev files new transactions into your buckets as they arrive.",
      bullets: [
        "Uses your own Section, Category, and Subcategory labels.",
        "Learns from how you filed similar rows before.",
        "Runs on import, so you review results instead of typing labels.",
      ],
    },
    features: [
      {
        icon: Zap,
        label: "Hundreds of rows sorted before your coffee cools",
      },
      {
        icon: CheckCheck,
        label: "Labels match how you file, so they land right the first time",
      },
      {
        icon: Sparkles,
        label: "Nothing piles up waiting to be fixed at month end",
      },
    ],
    Scene: JevClassifyScene,
  },
  {
    id: "encryption",
    badge: { icon: Lock, label: "End-to-end encrypted" },
    title: "🙈 We never see what you upload. It's all encrypted.",
    info: {
      title: "How encryption works",
      lead: "Statements are encrypted in your browser before anything is uploaded.",
      bullets: [
        "Your password derives the key. It never leaves this device.",
        "Our servers only ever store ciphertext and safe metadata.",
        "Optional cloud OCR or AI is opt-in and clearly labeled.",
      ],
    },
    features: [
      {
        icon: ShieldCheck,
        label: "Nobody, including us, can read your ledger",
      },
      {
        icon: KeyRound,
        label: "Your password is the only key, and it stays on your device",
      },
      {
        icon: EyeOff,
        label: "What we keep is noise, not your spending",
      },
    ],
    Scene: EncryptionScene,
  },
  {
    id: "import",
    badge: { icon: FileScan, label: "Statement import" },
    title: "Painless, simple and flexible. No need to link your bank!",
    info: {
      title: "How import works",
      lead: "Turn bank PDFs and phone photos into clean transactions.",
      bullets: [
        "Up to 24 files per upload, 20MB each.",
        "Already-imported files are flagged before the scan.",
        'Upload rules like "ACME payroll is income" guide the reader.',
      ],
    },
    features: [
      {
        icon: ScanLine,
        label: "Photograph a statement and the rows type themselves",
      },
      {
        icon: ShieldCheck,
        label: "Upload the same month twice, nothing doubles up",
      },
      {
        icon: Layers,
        label: "Tell it once how your bank writes and it remembers",
      },
    ],
    Scene: StatementImportScene,
  },
  {
    id: "classify",
    badge: { icon: Tags, label: "Classifications" },
    title: "Find the forgotten subscriptions quietly draining you",
    info: {
      title: "How labels work",
      lead: "Three levels of buckets plus free-form tags.",
      bullets: [
        "Section, then Category, then Subcategory. Food, Dining, Coffee shops.",
        "Start from a shared catalog, then edit or add your own labels.",
        "Tags can sit on any spend. Tag a date range to label a whole trip.",
      ],
    },
    features: [
      {
        icon: Layers,
        label: "The $14 you forgot about has nowhere left to hide",
      },
      {
        icon: Tag,
        label: "Tag a trip in one click and see what it really cost",
      },
      {
        icon: ShieldCheck,
        label: "Sensible labels to start, rename anything you like",
      },
    ],
    Scene: ClassificationScene,
  },
  {
    id: "analysis",
    badge: { icon: BarChart3, label: "Analysis" },
    title: "Understand your spending habits at a glance",
    info: {
      title: "What Analysis shows",
      lead: "Spending, income, and transfers over any period.",
      bullets: [
        "Slice by Sections, Categories, Subcategories, or Merchants.",
        "Summary, Average, and High Mid Low views.",
        "Standard or relative scale for the time series.",
      ],
    },
    features: [
      {
        icon: TrendingUp,
        label: "One chart tells you if you came out ahead this month",
      },
      {
        icon: BarChart3,
        label: "Spot the merchant eating a third of your food budget",
      },
      {
        icon: Layers,
        label: "Catch the wild months before they become normal",
      },
    ],
    Scene: AnalysisScene,
  },
  {
    id: "loans-ai",
    badge: { icon: Landmark, label: "Loans & AI" },
    title: "Know exactly how close you are to debt free",
    info: {
      title: "Loans and Cloud Processing",
      lead: "Track debt precisely and choose when AI may see numbers.",
      bullets: [
        "Mortgage, auto, student, personal, HELOC, or other loans.",
        "Scan the loan document to fill the form. The scan stays encrypted.",
        "Canvas AI and OCR run only when Cloud Processing is on.",
      ],
    },
    features: [
      {
        icon: Landmark,
        label: "See how much of each payment really shrinks the loan",
      },
      {
        icon: ScanLine,
        label: "Photograph the paperwork instead of retyping it",
      },
      {
        icon: Sparkles,
        label: "AI sees your numbers only when you switch it on",
      },
    ],
    Scene: LoansAiScene,
  },
];

const SLIDE_TRANSITION = { duration: 0.35, ease: "easeInOut" } as const;

export function ProductShowcaseCard() {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  const [index, setIndex] = useState(0);

  const goNext = useCallback(() => {
    setIndex((current) => (current + 1) % SLIDES.length);
  }, []);
  const goPrev = useCallback(() => {
    setIndex((current) => (current - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onSwipePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement | null)?.closest("button, a")) return;
      swipeStart.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );
  const onSwipePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  const slide = SLIDES[index];
  const BadgeIcon = slide.badge.icon;

  return (
    <Card className="flex h-[34.5rem] w-full flex-col sm:h-[36rem] lg:h-[38rem]">
      <CardHeader className="shrink-0">
        <div className="grid h-[4.25rem] content-start gap-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide.id}
              initial={animate ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animate ? { opacity: 0, y: -6 } : undefined}
              transition={SLIDE_TRANSITION}
              className="grid gap-1"
            >
              <Badge variant="secondary" className="w-fit gap-1.5">
                <BadgeIcon />
                {slide.badge.label}
              </Badge>
              <CardTitle className="flex items-start gap-1.5 text-lg leading-tight sm:text-xl">
                {slide.title}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={slide.info.title}
                      className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    className="w-[min(20rem,calc(100vw-2rem))]"
                  >
                    <PopoverHeader className="gap-1.5">
                      <PopoverTitle>{slide.info.title}</PopoverTitle>
                      <PopoverDescription className="leading-relaxed">
                        {slide.info.lead}
                      </PopoverDescription>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground">
                        {slide.info.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    </PopoverHeader>
                  </PopoverContent>
                </Popover>
              </CardTitle>
            </motion.div>
          </AnimatePresence>
        </div>
      </CardHeader>

      <CardContent
        className="flex min-h-0 flex-1 touch-pan-y flex-col gap-4"
        onPointerDown={onSwipePointerDown}
        onPointerUp={onSwipePointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide.id}
              initial={animate ? { opacity: 0, x: 24 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={animate ? { opacity: 0, x: -24 } : undefined}
              transition={SLIDE_TRANSITION}
              className="absolute inset-0 flex flex-col gap-4 sm:gap-4"
            >
              <div className="min-h-0 flex-1">
                <slide.Scene animate={animate} onDone={goNext} />
              </div>

              <ul className="shrink-0 space-y-1.5 sm:space-y-2">
                {slide.features.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
                    <span className="leading-snug">{label}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex h-11 shrink-0 items-center justify-center gap-1">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground touch-manipulation hover:bg-accent-subtle hover:text-accent"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div
            className="flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label="Product tour"
          >
            {SLIDES.map((item, itemIndex) => {
              const selected = itemIndex === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={item.title}
                  onClick={() => setIndex(itemIndex)}
                  className="flex min-h-11 min-w-8 items-center justify-center touch-manipulation"
                >
                  <motion.span
                    className="block h-1.5 rounded-full"
                    animate={{
                      width: selected ? 20 : 6,
                      backgroundColor: selected
                        ? "var(--accent)"
                        : "var(--border)",
                    }}
                    transition={{ duration: 0.25 }}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground touch-manipulation hover:bg-accent-subtle hover:text-accent"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
