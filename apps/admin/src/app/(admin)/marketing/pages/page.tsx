"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@tarodan/ui";
import {
  PencilIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  PREDEFINED_PAGES,
  PAGES_QUERY_KEY,
  type PredefinedSlug,
  type StaticPage,
} from "./_lib/content";
import { PageEditorModal } from "./_modals/PageEditorModal";

export default function PagesPage() {
  const [editSlug, setEditSlug] = useState<PredefinedSlug | null>(null);

  const { data: pageMap = {}, isLoading } = useQuery<
    Record<string, StaticPage>
  >({
    queryKey: PAGES_QUERY_KEY,
    queryFn: async () => {
      const res = await adminApi.getPages();
      const pages: StaticPage[] = res.data?.data ?? [];
      return Object.fromEntries(pages.map((p) => [p.slug, p]));
    },
  });

  return (
    <AdminPage>
      <PageHeader
        title="Sayfa Yönetimi"
        description="Web sitesinin sabit sayfalarının içeriğini düzenleyin."
      />

      {isLoading ? (
        <SectionCard>
          <p className="text-center text-muted">Yükleniyor…</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PREDEFINED_PAGES.map((page) => {
            const existing = pageMap[page.slug];
            const badge = existing ? (
              <Badge
                variant={existing.isPublished ? "success" : "secondary"}
                size="sm"
                className="inline-flex items-center gap-1"
              >
                <GlobeAltIcon className="h-3 w-3" />
                {existing.isPublished ? "Yayında" : "Taslak"}
              </Badge>
            ) : (
              <Badge
                variant="warning"
                size="sm"
                className="inline-flex items-center gap-1"
              >
                <ExclamationTriangleIcon className="h-3 w-3" />
                İçerik yok
              </Badge>
            );
            return (
              <SectionCard
                key={page.slug}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {page.title}
                    {badge}
                  </span>
                }
                actions={
                  <Button
                    size="sm"
                    leftIcon={<PencilIcon className="h-4 w-4" />}
                    onClick={() => setEditSlug(page.slug)}
                  >
                    {existing ? "Düzenle" : "İçerik Oluştur"}
                  </Button>
                }
              >
                <p className="text-sm text-muted">{page.description}</p>
                <p className="mt-1 font-mono text-xs text-subtle">{page.url}</p>
              </SectionCard>
            );
          })}
        </div>
      )}

      {editSlug && (
        <PageEditorModal
          slug={editSlug}
          existing={pageMap[editSlug]}
          onClose={() => setEditSlug(null)}
        />
      )}
    </AdminPage>
  );
}
