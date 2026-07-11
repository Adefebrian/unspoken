// Lightweight in-memory sliding-window limiter. Single-container by design
// (see README); for multi-instance, back this with Redis.

export interface Limiter {
  /** Returns true if allowed (and records the hit), false if over the limit. */
  hit(key: string): boolean;
  /** Read-only: is this key currently over the limit? */
  over(key: string): boolean;
}

export function createLimiter(max: number, windowMs: number): Limiter {
  const buckets = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const times = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    buckets.set(key, times);
    return times;
  }

  // Periodic sweep so idle keys do not accumulate.
  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of buckets) {
      const live = times.filter((t) => now - t < windowMs);
      if (live.length === 0) buckets.delete(key);
      else buckets.set(key, live);
    }
  }, windowMs).unref?.();

  return {
    hit(key) {
      const now = Date.now();
      const times = recent(key, now);
      if (times.length >= max) return false;
      times.push(now);
      return true;
    },
    over(key) {
      return recent(key, Date.now()).length >= max;
    },
  };
}
