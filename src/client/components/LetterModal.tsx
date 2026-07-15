import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactionType, UnspokenDTO } from "../../shared/types.ts";
import { subscribeLetter } from "../lib/letter.ts";
import { getFlags, setFlag, type Flags } from "../lib/reacted.ts";
import { reportUnspoken, sendReaction } from "../lib/api.ts";
import { relativeTime } from "../lib/time.ts";
import { toast } from "../lib/toast.ts";
import { openShare } from "../lib/share.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";
import { ReactChip, FlagIcon, ShareIcon } from "./ReactChip.tsx";

/** Full-letter viewer. Mounted once at the app root; opened via openLetter(). */
export function LetterModal() {
  const [u, setU] = useState<UnspokenDTO | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [counts, setCounts] = useState({ relate: 0, hug: 0 });
  const [flags, setFlags] = useState<Flags>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLElement>(null);
  useFocusTrap(cardRef, !!u);

  useEffect(() => {
    return subscribeLetter((next) => {
      clearTimeout(timer.current);
      if (next) {
        setU(next);
        setLeaving(false);
        setCounts({ relate: next.relateCount, hug: next.hugCount });
        setFlags(getFlags(next.id));
      } else {
        close();
      }
    });
  }, []);

  const close = useCallback(() => {
    setLeaving(true);
    timer.current = setTimeout(() => setU(null), 240);
  }, []);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!u) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [u, close]);

  if (!u) return null;

  function react(type: ReactionType) {
    if (!u || flags[type]) return;
    setFlag(u.id, type);
    setFlags((f) => ({ ...f, [type]: true }));
    setCounts((c) => ({ ...c, [type]: c[type] + 1 }));
    sendReaction(u.id, type)
      .then((r) => setCounts({ relate: r.relateCount, hug: r.hugCount }))
      .catch(() => {});
  }

  function report() {
    if (!u || flags.report) return;
    if (!window.confirm("report this? it gets hidden if a few people flag it.")) return;
    setFlag(u.id, "report");
    setFlags((f) => ({ ...f, report: true }));
    reportUnspoken(u.id)
      .then(() => toast("got it. we'll take a look 🫶"))
      .catch(() => toast("couldn't report right now."));
  }

  return (
    <div
      className={`letter-backdrop ${leaving ? "is-leaving" : ""}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <article
        ref={cardRef}
        className={`letter ${leaving ? "is-leaving" : ""}`}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sage">
              an unspoken letter
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              left here by someone, {relativeTime(u.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="note-hand text-[1.2rem] leading-[1.65] sm:text-[1.35rem]">{u.body}</p>

        <div className="mt-7 border-t border-line pt-5">
          <p className="mb-3 text-sm text-ink-faint">
            you're not the only one who's felt this. hold it gently.
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ReactChip kind="relate" active={!!flags.relate} count={counts.relate} onClick={() => react("relate")} size="lg" />
              <ReactChip kind="hug" active={!!flags.hug} count={counts.hug} onClick={() => react("hug")} size="lg" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => u && openShare(u)}
                aria-label="Share this to your story"
                title="share to story"
                className="text-ink-faint transition-colors hover:text-sage"
              >
                <ShareIcon />
              </button>
              <button
                type="button"
                onClick={report}
                disabled={!!flags.report}
                aria-label="Report this"
                title={flags.report ? "reported" : "report"}
                className="text-ink-faint transition-colors hover:text-blush disabled:opacity-40"
              >
                <FlagIcon />
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
