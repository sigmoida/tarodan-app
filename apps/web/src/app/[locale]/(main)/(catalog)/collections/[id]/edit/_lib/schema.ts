/** @format */

import { z } from "zod";
import type { Collection } from "./types";

/** Collection edit form (RHF/zod). The cover is applied immediately on upload
 *  (its own endpoint) and `coverImageUrl` only holds the URL for preview — it is
 *  not sent again on save. */
export const collectionEditSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  isPublic: z.boolean(),
  coverImageUrl: z.string().optional(),
});

export type CollectionEditValues = z.infer<typeof collectionEditSchema>;

export const emptyCollectionEditValues: CollectionEditValues = {
  name: "",
  description: "",
  categoryId: "",
  isPublic: true,
  coverImageUrl: "",
};

export function collectionToForm(c: Collection): CollectionEditValues {
  return {
    name: c.name || "",
    description: c.description || "",
    categoryId: c.categoryId || "",
    isPublic: c.isPublic ?? true,
    coverImageUrl: c.coverImageUrl || "",
  };
}
