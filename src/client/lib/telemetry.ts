// Lightweight client telemetry: JS errors + Core Web Vitals, beaconed to the
// server (which logs them, and forwards to Sentry if a DSN is configured).
// No heavy SDK in the bundle; web-vitals is lazy-loaded as its own chunk.

function send(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({ ...payload, path: location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    /* never let telemetry break the app */
  }
}

export function reportError(kind: string, message: unknown, extra?: Record<string, unknown>): void {
  send({ type: "error", kind, message: String(message).slice(0, 500), ...extra });
}

let installed = false;
export function initTelemetry(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (e) =>
    reportError("window.error", e.message, { source: e.filename, line: e.lineno }),
  );
  window.addEventListener("unhandledrejection", (e) =>
    reportError("unhandledrejection", (e as PromiseRejectionEvent).reason),
  );

  // Core Web Vitals (LCP / INP / CLS), lazy chunk.
  import("web-vitals")
    .then(({ onLCP, onINP, onCLS }) => {
      const report = (m: { name: string; value: number; rating: string }) =>
        send({ type: "vital", name: m.name, value: Math.round(m.value * 1000) / 1000, rating: m.rating });
      onLCP(report);
      onINP(report);
      onCLS(report);
    })
    .catch(() => {});
}
