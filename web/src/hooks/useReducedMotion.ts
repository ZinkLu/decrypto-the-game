import { useState, useEffect } from 'react';

/**
 * SSR-safe, reactive hook for prefers-reduced-motion.
 *
 * Replaces the old module-level `window.matchMedia(...)` snapshot that:
 * - crashed in SSR / test environments (no `window`)
 * - never updated when the user toggled the OS setting
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
