import type { ReactionType, UnspokenDTO } from "../../shared/types.ts";
import { UnspokenCard } from "./UnspokenCard.tsx";

interface Props {
  items: UnspokenDTO[];
  freshIds?: Set<string>;
  onReact: (id: string, type: ReactionType) => void;
  onReport: (id: string) => void;
}

export function Wall({ items, freshIds, onReact, onReport }: Props) {
  return (
    <div className="wall">
      {items.map((u, i) => (
        <UnspokenCard
          key={u.id}
          u={u}
          index={i}
          fresh={freshIds?.has(u.id)}
          onReact={onReact}
          onReport={onReport}
        />
      ))}
    </div>
  );
}
