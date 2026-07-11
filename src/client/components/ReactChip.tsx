import type { ReactionType } from "../../shared/types.ts";

export function ReactChip({
  kind,
  active,
  count,
  onClick,
  size = "sm",
}: {
  kind: ReactionType;
  active: boolean;
  count: number;
  onClick: () => void;
  size?: "sm" | "lg";
}) {
  const label = kind === "relate" ? "relate" : "hug";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`chip chip--${kind} ${active ? "is-on" : ""} ${
        size === "lg" ? "text-[0.95rem]" : ""
      }`}
      aria-pressed={active}
      aria-label={`${label} (${count})`}
    >
      {kind === "relate" ? <RelateIcon /> : <HugIcon />}
      <span>{label}</span>
      {count > 0 && (
        <span key={count} className="count-pop tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

export function RelateIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HugIcon() {
  // Two people embracing: two heads leaning together, arm wrapping across.
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.3" cy="7.8" r="2.9" fill="currentColor" />
      <circle cx="15.7" cy="7.8" r="2.9" fill="currentColor" />
      <path
        d="M3.8 20c0-3.4 2.1-5.7 4.6-5.7M20.2 20c0-3.4-2.1-5.7-4.6-5.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M5.8 13.7c2.2 1.9 10.2 1.9 12.4 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 21V4m0 1h11l-2 3 2 3H5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
