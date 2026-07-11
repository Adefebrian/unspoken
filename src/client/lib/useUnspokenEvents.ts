import { useEffect, useRef } from "react";
import type { ReactionResult, UnspokenDTO } from "../../shared/types.ts";

interface Handlers {
  onNew?: (u: UnspokenDTO) => void;
  onReaction?: (r: ReactionResult) => void;
  onHide?: (h: { id: string }) => void;
  onStatus?: (connected: boolean) => void;
}

/** Subscribe to the realtime stream. Handlers are read through a ref so the
 *  EventSource is created once and never re-subscribes on re-render. */
export function useUnspokenEvents(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("open", () => ref.current.onStatus?.(true));
    es.addEventListener("error", () => ref.current.onStatus?.(false));
    es.addEventListener("new", (e) =>
      ref.current.onNew?.(JSON.parse((e as MessageEvent).data) as UnspokenDTO),
    );
    es.addEventListener("reaction", (e) =>
      ref.current.onReaction?.(JSON.parse((e as MessageEvent).data) as ReactionResult),
    );
    es.addEventListener("hide", (e) =>
      ref.current.onHide?.(JSON.parse((e as MessageEvent).data) as { id: string }),
    );

    return () => es.close();
  }, []);
}
