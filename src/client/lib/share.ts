import type { UnspokenDTO } from "../../shared/types.ts";

// Tiny store so any card can open the share sheet without prop drilling,
// mirroring letter.ts.
type Listener = (u: UnspokenDTO | null) => void;

const listeners = new Set<Listener>();

export function openShare(u: UnspokenDTO): void {
  for (const listen of listeners) listen(u);
}

export function closeShare(): void {
  for (const listen of listeners) listen(null);
}

export function subscribeShare(listen: Listener): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
