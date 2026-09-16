import { useIsPresent } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Steps through `durations` (one hold time per step), then calls `onDone`
 * once after the last step has been shown. When `enabled` is false it jumps
 * to `restStep` and stays. Pauses while the scene is exiting so a leaving
 * slide can't advance the tour.
 */
export function useStepper(
  durations: readonly number[],
  enabled: boolean,
  onDone: () => void,
  restStep = durations.length - 1,
) {
  const isPresent = useIsPresent();
  const [step, setStep] = useState(enabled ? 0 : restStep);
  const count = durations.length;
  const ms = durations[step] ?? durations[count - 1] ?? 0;

  useEffect(() => {
    if (!enabled) {
      setStep(restStep);
      return;
    }
    if (!isPresent) return;
    const id = window.setTimeout(() => {
      if (step + 1 >= count) {
        onDone();
      } else {
        setStep(step + 1);
      }
    }, ms);
    return () => window.clearTimeout(id);
  }, [count, enabled, isPresent, ms, onDone, restStep, step]);

  return step;
}
