import { useState, useEffect, useRef } from 'react';
import type { TensionLevel } from '../theme/colors';

interface CountdownThresholds {
  warning: number;
  tense: number;
  critical: number;
}

interface CountdownOptions {
  totalSeconds: number;
  thresholds?: CountdownThresholds;
  onTimeUp?: () => void;
  paused?: boolean;
}

interface CountdownResult {
  timeLeft: number;
  tension: TensionLevel;
}

const DEFAULT_THRESHOLDS: CountdownThresholds = { warning: 30, tense: 15, critical: 5 };

/**
 * Consolidated countdown hook — replaces the repeated useState+setInterval+tension
 * pattern that was duplicated across 8+ page components.
 *
 * Key fixes over the old pattern:
 * - interval does NOT depend on timeLeft (no teardown/rebuild every second)
 * - onTimeUp is stored in a ref (stable across parent re-renders)
 * - tension is a derived value, not a separate useState (no extra render)
 */
export function useCountdown({
  totalSeconds,
  thresholds = DEFAULT_THRESHOLDS,
  onTimeUp,
  paused = false,
}: CountdownOptions): CountdownResult {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (paused || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeUpRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
    // Only re-create the interval when paused changes.
    // timeLeft is intentionally omitted — the updater function reads prev.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const tension: TensionLevel =
    timeLeft > thresholds.warning ? 'normal'
    : timeLeft > thresholds.tense ? 'warning'
    : timeLeft > thresholds.critical ? 'tense'
    : 'critical';

  return { timeLeft, tension };
}
