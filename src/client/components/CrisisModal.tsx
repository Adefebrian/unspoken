import { useEffect, useRef, useState } from "react";
import { subscribeCrisis } from "../lib/crisis.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";

// Shown when a submitted letter suggests a crisis. Warm, not clinical. The
// letter is still posted; this just offers real help alongside it.
export function CrisisModal() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useFocusTrap(cardRef, open);

  const close = () => {
    setLeaving(true);
    timer.current = setTimeout(() => setOpen(false), 240);
  };

  useEffect(() => {
    return subscribeCrisis(() => {
      clearTimeout(timer.current);
      setLeaving(false);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`letter-backdrop ${leaving ? "is-leaving" : ""}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crisis-title"
    >
      <div
        ref={cardRef}
        className={`released ${leaving ? "is-leaving" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="crisis-title" className="font-hand text-[1.7rem] leading-snug text-ink">
          your words are safe here. and so are you.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          it sounds like you are carrying something really heavy. you do not have to hold it
          alone. if you might be in danger, please reach out right now:
        </p>
        <div className="mt-4 space-y-2 text-left text-sm">
          <p className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-ink">
            <strong>Indonesia:</strong> call <strong>119</strong>, then press <strong>8</strong>{" "}
            (Kemenkes mental health line).
          </p>
          <p className="rounded-xl bg-paper-2 px-3.5 py-2.5 text-ink-soft">
            Anywhere: find a helpline near you at{" "}
            <a
              href="https://findahelpline.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sage underline"
            >
              findahelpline.com
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-5 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-transform active:scale-95"
        >
          okay
        </button>
      </div>
    </div>
  );
}
