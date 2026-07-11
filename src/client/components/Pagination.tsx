interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function pageList(page: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "...")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push("...");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("...");
  out.push(total);
  return out;
}

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink disabled:opacity-35"
      >
        ‹ prev
      </button>

      {pageList(page, totalPages).map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-1.5 text-ink-faint">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`h-9 min-w-9 rounded-full px-2 text-sm tabular-nums transition-colors ${
              p === page
                ? "bg-ink text-paper"
                : "border border-line bg-card text-ink-soft hover:text-ink"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink disabled:opacity-35"
      >
        next ›
      </button>
    </nav>
  );
}
