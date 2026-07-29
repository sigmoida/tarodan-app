"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { PageHeader } from "@/components/AdminList";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { useClientTableSort } from "@/hooks/useClientTableSort";
import { templateColumns } from "./_lib/columns";
import { type TemplateListItem } from "./_lib/types";
import { EmailTemplateEditorModal } from "./_modals/EmailTemplateEditorModal";
import { useTranslations } from "next-intl";

export default function EmailTemplatesPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);

  const {
    data: list = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: adminKeys.all("email-templates"),
    queryFn: async () => {
      const res = await adminApi.getEmailTemplates();
      return (res.data?.data || []) as TemplateListItem[];
    },
  });

  const q = search.trim().toLocaleLowerCase("tr");
  const visible = q
    ? list.filter((t) =>
        [t.key, t.name, t.group, t.subject ?? ""].some((f) =>
          f.toLocaleLowerCase("tr").includes(q),
        ),
      )
    : list;
  const sorted = useClientTableSort(visible);
  const groups = Array.from(new Set(visible.map((t) => t.group)));

  const columns = templateColumns(setEditKey, t);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.emailTemplates.title")}
        description={
          <>
            {t("admin.marketing.emailTemplates.descriptionPrefix")}{" "}
            <code className="rounded bg-surface-alt px-1 font-mono text-xs">
              {t.raw("admin.marketing.emailTemplates.variableExample")}
            </code>{" "}
            {t("admin.marketing.emailTemplates.descriptionSuffix")}
          </>
        }
      />

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("admin.marketing.emailTemplates.searchPlaceholder")}
        className="w-full sm:w-80"
      />

      {isError ? (
        <QueryErrorCard
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      ) : isLoading ? (
        <SectionCard>
          <p className="text-center text-muted">{t("common.loading")}</p>
        </SectionCard>
      ) : visible.length === 0 ? (
        <SectionCard>
          <p className="text-center text-muted">
            {q
              ? t("admin.marketing.emailTemplates.noSearchResults")
              : t("admin.marketing.emailTemplates.notFound")}
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <SectionCard key={group} title={group}>
              <DataTable
                columns={columns}
                data={sorted.rows.filter((t) => t.group === group)}
                getRowId={(t) => t.key}
                sort={sorted.sort}
                onSort={sorted.setSort}
              />
            </SectionCard>
          ))}
        </div>
      )}

      {editKey && (
        <EmailTemplateEditorModal
          templateKey={editKey}
          onClose={() => setEditKey(null)}
        />
      )}
    </AdminPage>
  );
}
