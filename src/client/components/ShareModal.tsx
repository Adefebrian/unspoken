import { useCallback, useEffect, useRef, useState } from "react";
import type { UnspokenDTO } from "../../shared/types.ts";
import { subscribeShare } from "../lib/share.ts";
import { canvasToBlob, renderStory } from "../lib/storyCanvas.ts";
import { toast } from "../lib/toast.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";

/**
 * Turns any card into a shareable, Instagram-story-sized image (1080x1920).
 * Mounted once at the app root; opened via openShare().
 */
export function ShareModal() {
  const [u, setU] = useState<UnspokenDTO | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const previewRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLElement>(null);
  useFocusTrap(cardRef, !!u);

  const close = useCallback(() => {
    setLeaving(true);
    timer.current = setTimeout(() => {
      setU(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      previewRef.current = null;
      blobRef.current = null;
    }, 240);
  }, []);

  useEffect(() => {
    return subscribeShare((next) => {
      clearTimeout(timer.current);
      if (next) {
        setU(next);
        setLeaving(false);
      } else {
        close();
      }
    });
  }, [close]);

  // Render the story image whenever a new letter is opened.
  useEffect(() => {
    if (!u) return;
    let alive = true;
    setPreview(null);
    blobRef.current = null;
    renderStory(u)
      .then(canvasToBlob)
      .then((blob) => {
        if (!alive) return;
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewRef.current = url;
        setPreview(url);
      })
      .catch(() => {
        if (alive) toast("couldn't build the image right now.");
      });
    return () => {
      alive = false;
    };
  }, [u]);

  // Lock scroll + close on Escape while open.
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

  function file(): File | null {
    if (!blobRef.current) return null;
    return new File([blobRef.current], `unspoken-${u?.id ?? "letter"}.png`, {
      type: "image/png",
    });
  }

  async function shareStory() {
    const f = file();
    if (!f) return;
    setBusy(true);
    try {
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [f] })) {
        await nav.share({
          files: [f],
          title: "an unspoken letter",
          text: "something someone left unspoken · unspoken.zone",
        });
      } else {
        download(f);
        toast("image saved. open your instagram story and add it 🫶");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast("sharing didn't work, image saved instead.");
    } finally {
      setBusy(false);
    }
  }

  function saveImage() {
    const f = file();
    if (!f) return;
    download(f);
    toast("saved to your device 🫶");
  }

  return (
    <div
      className={`letter-backdrop ${leaving ? "is-leaving" : ""}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Share this letter to your story"
    >
      <article
        ref={cardRef}
        className={`share-sheet ${leaving ? "is-leaving" : ""}`}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-sage">
              share to your story
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">sized for instagram stories (9:16).</p>
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

        <div className="share-stage">
          {preview ? (
            <img src={preview} alt="Preview of your story" className="share-preview" />
          ) : (
            <div className="share-preview share-preview--loading">
              <span className="share-spinner" aria-hidden="true" />
              <span className="text-sm text-ink-faint">painting your story…</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={shareStory}
            disabled={!preview || busy}
            className="share-btn share-btn--primary"
          >
            {busy ? "opening…" : "share to instagram story"}
          </button>
          <button
            type="button"
            onClick={saveImage}
            disabled={!preview || busy}
            className="share-btn share-btn--ghost"
          >
            save image
          </button>
        </div>
      </article>
    </div>
  );
}

function download(f: File): void {
  const url = URL.createObjectURL(f);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
