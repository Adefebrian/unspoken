import type { UnspokenDTO } from "../../shared/types.ts";

// Tiny store so any card can open the full-letter modal without prop drilling.
type Listener = (u: UnspokenDTO | null) => void;

const listeners = new Set<Listener>();

export function openLetter(u: UnspokenDTO): void {
  for (const listen of listeners) listen(u);
}

export function closeLetter(): void {
  for (const listen of listeners) listen(null);
}

export function subscribeLetter(listen: Listener): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
