import { useEffect, type ReactNode } from "react";
import type Lenis from "lenis";

/**
 * Lenis smooth scrolling. Loaded as a lazy chunk after the page is idle so the
 * library stays out of the initial bundle and never competes with LCP. Disabled
 * when the user prefers reduced motion.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: Lenis | null = null;
    let frame = 0;
    let cancelled = false;

    const start = () => {
      // Dynamic import: Bun splits this into a separate chunk fetched on demand.
      void import("lenis").then(({ default: LenisCtor }) => {
        if (cancelled) return;
        lenis = new LenisCtor({
          duration: 1.05,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
        });
        const raf = (time: number) => {
          lenis!.raf(time);
          frame = requestAnimationFrame(raf);
        };
        frame = requestAnimationFrame(raf);
      });
    };

    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    const handle = ric ? ric(start, { timeout: 2000 }) : window.setTimeout(start, 800);

    return () => {
      cancelled = true;
      if (cic) cic(handle);
      else clearTimeout(handle);
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, []);

  return <>{children}</>;
}
