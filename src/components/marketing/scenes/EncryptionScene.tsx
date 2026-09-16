"use client";

import { Cloud, KeyRound, LaptopMinimal, Lock, LockOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const PLAINTEXT = "$42.10 · Coffee";
const CIPHERTEXT = "a9f3…c0e1";

/** Where the data packet sits on the track (percent of track width) for each step. */
const STEPS = [
  {
    packetLeft: "0%",
    encrypted: false,
    caption: "You upload a statement. It stays in your browser.",
  },
  {
    packetLeft: "50%",
    encrypted: true,
    caption: "Your password unlocks a key that never leaves this device.",
  },
  {
    packetLeft: "100%",
    encrypted: true,
    caption: "Only scrambled ciphertext reaches our servers.",
  },
  {
    packetLeft: "0%",
    encrypted: false,
    caption: "Sign in anywhere with your password to read it again.",
  },
] as const;

const CAPTIONS = STEPS.map((s) => s.caption);
const DURATIONS = CAPTIONS.map(captionMs);

const NODES = [
  { icon: LaptopMinimal, label: "Your device", activeOn: [0, 3] },
  { icon: KeyRound, label: "Your key", activeOn: [1] },
  { icon: Cloud, label: "Our servers", activeOn: [2] },
] as const;

export function EncryptionScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone, 2);
  const current = STEPS[step];

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="relative">
        <div className="absolute inset-x-[16.6%] top-5 h-px bg-[var(--border)]" />
        <motion.div
          className="absolute top-5 h-px origin-left bg-[var(--accent)]"
          style={{ left: "16.6%", right: "16.6%" }}
          animate={{ scaleX: step === 0 || step === 3 ? 0 : step === 1 ? 0.5 : 1 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
        <div className="relative grid grid-cols-3">
          {NODES.map(({ icon: Icon, label, activeOn }, index) => {
            const active = (activeOn as readonly number[]).includes(step);
            return (
              <div key={label} className="flex flex-col items-center gap-2">
                <motion.div
                  className="relative flex size-10 items-center justify-center rounded-full border bg-[var(--surface)]"
                  animate={{
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    scale: active ? 1.08 : 1,
                  }}
                  transition={{ duration: 0.35 }}
                >
                  <Icon
                    className={
                      active
                        ? "size-5 text-[var(--accent)]"
                        : "size-5 text-[var(--muted-foreground)]"
                    }
                  />
                  {index === 2 ? (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)]">
                      <Lock className="size-2.5" />
                    </span>
                  ) : null}
                </motion.div>
                <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Data packet riding the track */}
        <div className="relative mt-5 h-11" style={{ marginInline: "16.6%" }}>
          <motion.div
            className="absolute top-0 -translate-x-1/2"
            animate={{ left: current.packetLeft }}
            transition={
              animate ? { type: "spring", stiffness: 120, damping: 20 } : { duration: 0 }
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={current.encrypted ? "cipher" : "plain"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className={
                  current.encrypted
                    ? "inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 font-mono text-[11px] text-[var(--accent-foreground)] shadow-sm sm:px-2.5 sm:text-xs"
                    : "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[11px] text-[var(--foreground)] shadow-sm sm:px-2.5 sm:text-xs"
                }
              >
                {current.encrypted ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                {current.encrypted ? CIPHERTEXT : PLAINTEXT}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </SceneFrame>
  );
}
