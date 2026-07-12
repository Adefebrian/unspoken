import Redis from "ioredis";
import { env } from "./env.ts";

// Redis is OPTIONAL and used only to fan SSE events out across app replicas.
// No REDIS_URL  -> null clients, and the event bus falls back to in-process
// fan-out (correct + fastest for a single instance).
// REDIS_URL set -> two connections: one to publish, one dedicated subscriber
// (a connection in subscribe mode cannot issue normal commands).
export const redisEnabled = Boolean(env.REDIS_URL);

function make(role: "pub" | "sub"): Redis {
  const client = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: false,
    // Publisher fails fast if Redis is down so publish() can fall back to local
    // fan-out instead of hanging. The subscriber keeps its offline queue so the
    // initial subscribe() (issued at import, before the socket is ready) is held
    // and runs once connected; ioredis re-subscribes automatically on reconnect.
    ...(role === "pub"
      ? { maxRetriesPerRequest: 2, enableOfflineQueue: false }
      : { maxRetriesPerRequest: null }),
  });
  client.on("error", (e) =>
    console.error(JSON.stringify({ log: "redis_error", role, message: e.message })),
  );
  return client;
}

export const redisPub: Redis | null = redisEnabled ? make("pub") : null;
export const redisSub: Redis | null = redisEnabled ? make("sub") : null;
