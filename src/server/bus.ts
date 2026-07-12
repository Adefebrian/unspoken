import { redisPub, redisSub, redisEnabled } from "./redis.ts";

// Cross-instance event bus for realtime (SSE). With Redis, an event published
// by any app replica reaches every replica's SSE hub via pub/sub. Without
// Redis, publish() calls local handlers directly (single-instance fan-out).

export type BusEventName = "new" | "reaction" | "hide";
export interface BusEvent {
  event: BusEventName;
  data: unknown;
}
type Handler = (e: BusEvent) => void;

const CHANNEL = "unspoken:events";
const handlers = new Set<Handler>();

if (redisEnabled && redisSub) {
  redisSub
    .subscribe(CHANNEL)
    .then(() => console.log("[unspoken] realtime bus: Redis pub/sub"))
    .catch((e) => console.error(JSON.stringify({ log: "bus_subscribe_failed", message: String(e) })));

  // The publishing instance also receives its own message here, so publish()
  // must NOT additionally call local handlers when Redis is on (no double send).
  redisSub.on("message", (_channel, message) => {
    let e: BusEvent;
    try {
      e = JSON.parse(message) as BusEvent;
    } catch {
      return;
    }
    for (const h of handlers) h(e);
  });
} else {
  console.log("[unspoken] realtime bus: in-process (single instance)");
}

/** Publish an event to every app instance (or just this one without Redis). */
export function publish(event: BusEventName, data: unknown): void {
  const e: BusEvent = { event, data };
  if (redisEnabled && redisPub) {
    void redisPub.publish(CHANNEL, JSON.stringify(e)).catch(() => {
      // Redis hiccup: fall back to local delivery so this instance still updates.
      for (const h of handlers) h(e);
    });
  } else {
    for (const h of handlers) h(e);
  }
}

/** Register this instance's SSE hub to receive bus events. */
export function onBusEvent(handler: Handler): void {
  handlers.add(handler);
}
