import type { CreateSavedSearchInput } from "@tarodan/types";
import { api } from "./client";

/** The API's largest `limit` for `GET /saved-searches`. */
const SAVED_SEARCHES_PAGE_SIZE = 100;

/** Server-side saved searches (`/saved-searches`; contract delta 2026-10-21). */
export const savedSearchesApi = {
  /** One page, newest first (`{ data, meta: { total, totalPages, ... } }`). */
  list: (page = 1) =>
    api.get("/saved-searches", {
      params: { page, limit: SAVED_SEARCHES_PAGE_SIZE },
    }),
  create: (input: CreateSavedSearchInput) => api.post("/saved-searches", input),
  remove: (id: string) => api.delete(`/saved-searches/${id}`),
};
