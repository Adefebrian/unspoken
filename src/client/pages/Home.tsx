import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Composer } from "../components/Composer.tsx";
import { Wall } from "../components/Wall.tsx";
import { fetchLatest } from "../lib/api.ts";
import { useUnspokenEvents } from "../lib/useUnspokenEvents.ts";
import { useWallActions } from "../lib/useWallActions.ts";
import type { UnspokenDTO } from "../../shared/types.ts";

export function Home() {
  const [items, setItems] = useState<UnspokenDTO[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connected, setConnected] = useState(false);
  const [announce, setAnnounce] = useState("");
  const { reactTo, reportTo } = useWallActions(setItems);

  const addUnspoken = useCallback((u: UnspokenDTO, markFresh: boolean) => {
    setItems((prev) => (prev.some((x) => x.id === u.id) ? prev : [u, ...prev].slice(0, 10)));
    if (markFresh) {
      setFresh((prev) => new Set(prev).add(u.id));
      setTimeout(() => {
        setFresh((prev) => {
          const next = new Set(prev);
          next.delete(u.id);
          return next;
        });
      }, 2600);
    }
  }, []);

  const loadLatest = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchLatest()
      .then((rows) =>
        setItems((prev) => {
          // keep any note an SSE 'new' prepended while the fetch was in flight
          const ids = new Set(rows.map((r) => r.id));
          const extras = prev.filter((p) => !ids.has(p.id));
          return [...extras, ...rows].slice(0, 10);
        }),
      )
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  useUnspokenEvents({
    onNew: (u) => {
      addUnspoken(u, true);
      setAnnounce("a new unspoken just arrived on the wall");
    },
    onReaction: (r) =>
      setItems((prev) =>
        prev.map((u) =>
          u.id === r.id
            ? {
                ...u,
                relateCount: Math.max(u.relateCount, r.relateCount),
                hugCount: Math.max(u.hugCount, r.hugCount),
              }
            : u,
        ),
      ),
    onHide: ({ id }) => setItems((prev) => prev.filter((u) => u.id !== id)),
    onStatus: setConnected,
  });

  return (
    <main className="mx-auto max-w-4xl px-5 pb-8 sm:px-6">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <section className="pb-6 pt-3 text-center sm:pt-6">
        <h1 className="font-hand text-[2.1rem] font-bold leading-[1.04] text-ink sm:text-6xl">
          let it all out.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-[15px]">
          you've held it in for so long. let it live here instead of your chest,
          quietly, with people who just get it.
        </p>
      </section>

      <Composer onCreated={(u) => addUnspoken(u, true)} />

      <div className="mb-4 mt-9 flex items-center gap-2">
        <h2 className="font-patrick text-xl text-ink sm:text-2xl">fresh off the chest</h2>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? "bg-sage" : "bg-ink-faint"
          }`}
          style={connected ? { animation: "dotPulse 2s ease-in-out infinite" } : undefined}
          title={connected ? "live" : "connecting"}
          aria-hidden="true"
        />
      </div>

      {loading ? (
        <WallSkeleton />
      ) : error ? (
        <ErrorState onRetry={loadLatest} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <Wall items={items} freshIds={fresh} onReact={reactTo} onReport={reportTo} />
      )}

      <div className="mt-8 text-center">
        <Link
          to="/all"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-6 py-3 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          read what everyone's holding →
        </Link>
      </div>
    </main>
  );
}

function WallSkeleton() {
  return (
    <div className="wall">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="note p-5">
          <div className="h-4 w-3/4 rounded bg-line/70" />
          <div className="mt-3 h-4 w-1/2 rounded bg-line/70" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="note p-8 text-center">
      <p className="font-hand text-xl text-ink-soft sm:text-2xl">it's quiet in here…</p>
      <p className="mt-1 text-sm text-ink-faint">be the first to let something out.</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="note p-8 text-center">
      <p className="font-hand text-xl text-ink-soft sm:text-2xl">the wall wouldn't load.</p>
      <p className="mt-1 text-sm text-ink-faint">check your connection?</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-paper"
      >
        try again
      </button>
    </div>
  );
}
