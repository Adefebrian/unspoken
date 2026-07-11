import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeReleased } from "../lib/released.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";

// Warm, minimal reassurance shown right after someone lets something out.
const LINES = [
  "you're not alone in this. someone out there feels it too.",
  "that took courage. thank you for trusting us with it.",
  "it's out of your chest now. take a slow breath.",
  "somewhere, someone needed to read exactly that.",
  "you carried that quietly for long enough. it's out now.",
];

export function ReleasedModal() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [line, setLine] = useState(LINES[0]!);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, open);

  const close = useCallback(() => {
    setLeaving(true);
    timer.current = setTimeout(() => setOpen(false), 240);
  }, []);

  useEffect(() => {
    return subscribeReleased(() => {
      clearTimeout(timer.current);
      setLine(LINES[Math.floor(Date.now() / 1000) % LINES.length]!);
      setLeaving(false);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className={`letter-backdrop ${leaving ? "is-leaving" : ""}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div ref={cardRef} className={`released ${leaving ? "is-leaving" : ""}`} onClick={(e) => e.stopPropagation()}>
        <HeartHands />
        <p className="mt-4 font-hand text-[1.7rem] leading-snug text-ink">{line}</p>
        <button
          type="button"
          onClick={close}
          className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-transform active:scale-95"
        >
          breathe
        </button>
      </div>
    </div>
  );
}

function HeartHands() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mx-auto text-blush"
    >
      <path
        d="M12 20.5c-4-2.7-6.5-5.2-6.5-8.3A3 3 0 0 1 12 10.4a3 3 0 0 1 6.5 1.8c0 3.1-2.5 5.6-6.5 8.3Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M6.5 9.2C4 9.6 2.4 12 3.3 14.8c.4 1.3 1.4 2.3 2.7 2.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M17.5 9.2c2.5.4 4.1 2.8 3.2 5.6-.4 1.3-1.4 2.3-2.7 2.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
