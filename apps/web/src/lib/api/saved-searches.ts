import type { CreateSavedSearchInput } from "@tarodan/types";
import { api } from "./client";

/** Server-side saved searches (`/saved-searches`; contract delta 2026-10-21). */
export const savedSearchesApi = {
  /** Newest first. Launch tiers hold at most 50, so one page of 100 is the whole list. */
  list: () => api.get("/saved-searches", { params: { page: 1, limit: 100 } }),
  create: (input: CreateSavedSearchInput) => api.post("/saved-searches", input),
  remove: (id: string) => api.delete(`/saved-searches/${id}`),
};
