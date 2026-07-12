import type { Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { getClientIp, hashIp } from "./guard.ts";
import { onBusEvent, publish, type BusEventName } from "./bus.ts";
import { bumpFeedVersion } from "./ssr.ts";

// SSE hub for this app instance. Every connected browser holds one stream. When
// an unspoken is created / reacted to / hidden, broadcast() puts the event on
// the bus; the bus delivers it back here (and to peer instances via Redis) and
// we push to every browser connected to THIS instance.
const clients = new Set<SSEStreamingApi>();

// Connection-exhaustion guards (per instance). MAX_PER_IP is generous because
// many real users share one public IP behind carrier-grade NAT / office
// networks (and one person may open several tabs); too low a cap 429s them and
// kills realtime. The global cap is the real backstop against exhaustion.
const MAX_GLOBAL = 2000;
const MAX_PER_IP = 40;
const perIp = new Map<string, number>();

// Deliver any bus event (local or from a peer instance) to local browsers.
onBusEvent(({ event, data }) => {
  const payload = JSON.stringify(data);
  for (const stream of clients) {
    stream.writeSSE({ event, data: payload }).catch(() => clients.delete(stream));
  }
});

export function broadcast(event: BusEventName, data: unknown): void {
  // A new or hidden letter changes the visible feed, so drop the SSR cache;
  // reactions only tweak counts and are not worth invalidating over.
  if (event === "new" || event === "hide") bumpFeedVersion();
  publish(event, data);
}

export function clientCount(): number {
  return clients.size;
}

export function streamHandler(c: Context) {
  const ipHash = hashIp(getClientIp(c));

  if (clients.size >= MAX_GLOBAL) return c.text("stream is at capacity", 503);
  const current = perIp.get(ipHash) ?? 0;
  if (current >= MAX_PER_IP) return c.text("too many open connections", 429);
  perIp.set(ipHash, current + 1);

  return streamSSE(c, async (stream) => {
    clients.add(stream);
    let alive = true;

    const cleanup = () => {
      if (!alive) return;
      alive = false;
      clients.delete(stream);
      const left = (perIp.get(ipHash) ?? 1) - 1;
      if (left <= 0) perIp.delete(ipHash);
      else perIp.set(ipHash, left);
    };

    stream.onAbort(cleanup);
    await stream.writeSSE({ event: "hello", data: "connected" });

    // Heartbeat keeps the connection under Bun's idle timeout and lets the
    // browser notice a dropped server quickly.
    while (alive) {
      await stream.sleep(25_000);
      if (!alive) break;
      try {
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
      } catch {
        cleanup();
      }
    }
    cleanup();
  });
}
