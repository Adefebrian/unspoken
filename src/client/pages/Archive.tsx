import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Wall } from "../components/Wall.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { fetchPage } from "../lib/api.ts";
import { useUnspokenEvents } from "../lib/useUnspokenEvents.ts";
import { useWallActions } from "../lib/useWallActions.ts";
import type { UnspokenDTO } from "../../shared/types.ts";

export function Archive() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [items, setItems] = useState<UnspokenDTO[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(0);
  const { reactTo, reportTo } = useWallActions(setItems);

  const load = useCallback((p: number) => {
    setLoading(true);
    setError(false);
    fetchPage(p)
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(page);
    setPending(0);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page, load]);

  useUnspokenEvents({
    onNew: () => {
      if (page === 1) setPending((n) => n + 1);
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
  });

  function goTo(p: number) {
    setParams({ page: String(p) });
  }

  return (
    <main className="mx-auto max-w-4xl px-5 pb-10 sm:px-6">
      <section className="py-7 text-center">
        <h1 className="rise font-hand text-[2.5rem] font-bold text-ink sm:text-5xl">
          everything left unsaid
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {total > 0
            ? `${total} things people couldn't say out loud`
            : "the whole wall, page by page"}
        </p>
      </section>

      {pending > 0 && (
        <button
          type="button"
          onClick={() => {
            setPending(0);
            load(1);
          }}
          className="rise mx-auto mb-5 block rounded-full bg-sage px-5 py-2.5 text-sm text-paper shadow-md"
        >
          {pending} new {pending === 1 ? "voice" : "voices"} · tap to refresh
        </button>
      )}

      {loading ? (
        <WallSkeleton />
      ) : error ? (
        <div className="note p-8 text-center">
          <p className="font-hand text-2xl text-ink-soft">couldn't load this page.</p>
          <button
            type="button"
            onClick={() => load(page)}
            className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-paper"
          >
            try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="note p-8 text-center font-hand text-2xl text-ink-soft">
          nothing on this page.
        </p>
      ) : (
        <Wall items={items} onReact={reactTo} onReport={reportTo} />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={goTo} />
    </main>
  );
}

function WallSkeleton() {
  return (
    <div className="wall">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="note p-5">
          <div className="h-4 w-2/3 rounded bg-line/70" />
          <div className="mt-3 h-4 w-1/3 rounded bg-line/70" />
        </div>
      ))}
    </div>
  );
}
