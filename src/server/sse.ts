import type { Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { getClientIp, hashIp } from "./guard.ts";

// In-process fan-out hub. Every connected browser holds one SSE stream; when an
// unspoken is created / reacted to / hidden we push to all of them. Single
// container by design (see README), so an in-memory set is the lightest
// reliable option.
const clients = new Set<SSEStreamingApi>();

// Connection-exhaustion guards.
const MAX_GLOBAL = 2000;
const MAX_PER_IP = 5;
const perIp = new Map<string, number>();

export function broadcast(event: "new" | "reaction" | "hide", data: unknown): void {
  const payload = JSON.stringify(data);
  for (const stream of clients) {
    stream.writeSSE({ event, data: payload }).catch(() => clients.delete(stream));
  }
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
