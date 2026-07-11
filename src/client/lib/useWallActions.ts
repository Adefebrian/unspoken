import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ReactionType, UnspokenDTO } from "../../shared/types.ts";
import { reportUnspoken, sendReaction } from "./api.ts";
import { toast } from "./toast.ts";

type Setter = Dispatch<SetStateAction<UnspokenDTO[]>>;

/** Reaction + report handlers shared by the home and archive walls.
 *  Reactions update optimistically, then reconcile with the server's count
 *  (the SSE broadcast reconciles every other open tab). */
export function useWallActions(setItems: Setter) {
  const reactTo = useCallback(
    (id: string, type: ReactionType) => {
      setItems((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                relateCount: u.relateCount + (type === "relate" ? 1 : 0),
                hugCount: u.hugCount + (type === "hug" ? 1 : 0),
              }
            : u,
        ),
      );
      sendReaction(id, type)
        .then((res) =>
          setItems((prev) =>
            prev.map((u) =>
              u.id === id
                ? {
                    ...u,
                    // counts only ever grow; never let a stale response lower them
                    relateCount: Math.max(u.relateCount, res.relateCount),
                    hugCount: Math.max(u.hugCount, res.hugCount),
                  }
                : u,
            ),
          ),
        )
        .catch(() => {
          /* the SSE reaction event / next fetch reconciles the count */
        });
    },
    [setItems],
  );

  const reportTo = useCallback((id: string) => {
    reportUnspoken(id)
      .then(() => toast("Thank you. We'll take a look."))
      .catch(() => toast("Could not report right now."));
  }, []);

  return { reactTo, reportTo };
}
