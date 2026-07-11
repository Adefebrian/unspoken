import { useEffect, type RefObject } from "react";

/** Trap focus inside an open dialog, focus it on open, and restore focus to the
 *  previously-focused element on close. WCAG dialog pattern. */
export function useFocusTrap(ref: RefObject<HTMLElement>, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const sel =
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(sel));
    // Move focus into the dialog.
    (focusables()[0] ?? node).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, open]);
}
