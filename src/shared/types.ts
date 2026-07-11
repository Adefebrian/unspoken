export interface UnspokenDTO {
  id: string;
  body: string;
  relateCount: number;
  hugCount: number;
  createdAt: string;
}

export interface PageResult {
  items: UnspokenDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ReactionType = "relate" | "hug";

export interface ReactionResult {
  id: string;
  relateCount: number;
  hugCount: number;
}
