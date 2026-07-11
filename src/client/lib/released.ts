// Fires the warm "you let it out" popup after a successful post.
type Listener = () => void;

const listeners = new Set<Listener>();

export function showReleased(): void {
  for (const listen of listeners) listen();
}

export function subscribeReleased(listen: Listener): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
