import { useLayoutEffect, useRef, useState } from "react";
import { postUnspoken } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { showReleased } from "../lib/released.ts";
import { isCrisis, showCrisis } from "../lib/crisis.ts";
import type { UnspokenDTO } from "../../shared/types.ts";

const PROMPTS = [
  "what's been living rent-free in your head?",
  "the text you'll never actually send…",
  "say it here. no one will ever know it's you.",
  "that thing you can't tell anyone? tell us.",
  "the 3am thought you keep swallowing…",
];

export function Composer({ onCreated }: { onCreated?: (u: UnspokenDTO) => void }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholder] = useState(
    () => PROMPTS[Math.floor(Date.now() / 1000) % PROMPTS.length]!,
  );

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 460)}px`;
  }, [value]);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try {
      const created = await postUnspoken(trimmed);
      onCreated?.(created);
      const crisis = isCrisis(trimmed);
      setValue("");
      if (crisis) showCrisis();
      else showReleased();
    } catch (err) {
      toast(err instanceof Error ? err.message : "couldn't send. try again?");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="note composer rise p-4 transition-shadow sm:p-6">

      <textarea
        ref={areaRef}
        value={value}
        aria-label="Write what you can't say out loud"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="note-hand w-full resize-none bg-transparent text-[1.12rem] placeholder:text-ink-faint focus:outline-none sm:text-[1.35rem]"
      />

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-all hover:-translate-y-px active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {sending ? (
            <>
              <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-paper" />
              letting go
            </>
          ) : (
            <>
              let it out
              <PlaneIcon />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PlaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 3L10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
