import type {
  PageResult,
  ReactionResult,
  ReactionType,
  UnspokenDTO,
} from "../../shared/types.ts";

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
  }
  return data as T;
}

export function fetchLatest(): Promise<UnspokenDTO[]> {
  return fetch("/api/unspoken/latest").then((r) => parse<UnspokenDTO[]>(r));
}

export function fetchPage(page: number): Promise<PageResult> {
  return fetch(`/api/unspoken?page=${page}`).then((r) => parse<PageResult>(r));
}

export function postUnspoken(body: string): Promise<UnspokenDTO> {
  return fetch("/api/unspoken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  }).then((r) => parse<UnspokenDTO>(r));
}

export function sendReaction(id: string, type: ReactionType): Promise<ReactionResult> {
  return fetch(`/api/unspoken/${id}/react`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
  }).then((r) => parse<ReactionResult>(r));
}

export function reportUnspoken(id: string): Promise<{ ok: boolean }> {
  return fetch(`/api/unspoken/${id}/report`, { method: "POST" }).then((r) =>
    parse<{ ok: boolean }>(r),
  );
}
