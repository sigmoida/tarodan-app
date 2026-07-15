import { api } from "./client";

// Static pages (public, no auth)
export const pagesApi = {
  getBySlug: (slug: string) =>
    api.get<{
      id: string;
      slug: string;
      title: string;
      content: string;
      metaTitle: string | null;
      metaDescription: string | null;
      metaKeywords: string | null;
      updatedAt: string;
    }>(`/pages/${slug}`),
};
