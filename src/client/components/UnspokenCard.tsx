import { useEffect, useRef, useState } from "react";
import type { ReactionType, UnspokenDTO } from "../../shared/types.ts";
import { getFlags, setFlag } from "../lib/reacted.ts";
import { relativeTime } from "../lib/time.ts";
import { openLetter } from "../lib/letter.ts";
import { ReactChip, FlagIcon } from "./ReactChip.tsx";

interface Props {
  u: UnspokenDTO;
  index?: number;
  fresh?: boolean;
  onReact: (id: string, type: ReactionType) => void;
  onReport: (id: string) => void;
}

export function UnspokenCard({ u, index = 0, fresh, onReact, onReport }: Props) {
  const [flags, setFlags] = useState(() => getFlags(u.id));
  const [clamped, setClamped] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const measure = () => {
      const el = bodyRef.current;
      if (el) setClamped(el.scrollHeight - el.clientHeight > 4);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [u.body]);

  function react(type: ReactionType) {
    if (flags[type]) return;
    setFlag(u.id, type);
    setFlags((f) => ({ ...f, [type]: true }));
    onReact(u.id, type);
  }

  function report() {
    if (flags.report) return;
    if (!window.confirm("report this? it gets hidden if a few people flag it.")) return;
    setFlag(u.id, "report");
    setFlags((f) => ({ ...f, report: true }));
    onReport(u.id);
  }

  return (
    <article
      className={`note flex flex-col p-4 sm:p-5 ${fresh ? "note--fresh" : "note--enter"}`}
      style={{ animationDelay: `${Math.min(index, 9) * 55}ms` }}
    >
      {/* Whole letter body is a button: opens the full letter, even when short. */}
      <button
        type="button"
        onClick={() => openLetter(u)}
        aria-label="Open this letter in full"
        className="note-open"
      >
        <p ref={bodyRef} className="note-hand text-[1.05rem] note-clamp sm:text-[1.22rem]">
          {u.body}
        </p>
        {clamped && <span className="mt-1 block text-sm font-medium text-sage">read the rest →</span>}
      </button>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <div className="flex items-center gap-2">
          <ReactChip kind="relate" active={!!flags.relate} count={u.relateCount} onClick={() => react("relate")} />
          <ReactChip kind="hug" active={!!flags.hug} count={u.hugCount} onClick={() => react("hug")} />
        </div>

        <div className="flex items-center gap-3">
          <time className="text-xs text-ink-faint" dateTime={u.createdAt}>
            {relativeTime(u.createdAt)}
          </time>
          <button
            type="button"
            onClick={report}
            disabled={!!flags.report}
            aria-label="Report this unspoken"
            title={flags.report ? "reported" : "report"}
            className="text-ink-faint transition-colors hover:text-blush disabled:opacity-40"
          >
            <FlagIcon />
          </button>
        </div>
      </div>
    </article>
  );
}
