"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { templateColumns } from "./_lib/columns";
import { type TemplateListItem } from "./_lib/types";
import { EmailTemplateEditorModal } from "./_modals/EmailTemplateEditorModal";

export default function EmailTemplatesPage() {
  const [search, setSearch] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);

  const { data: list = [], isLoading } = useQuery({
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
  const groups = Array.from(new Set(visible.map((t) => t.group)));

  const columns = templateColumns(setEditKey);

  return (
    <AdminPage>
      <PageHeader
        title="E-posta Şablonları"
        description={
          <>
            Sistem e-postalarını özelleştirin. Değişkenler için{" "}
            <code className="rounded bg-surface-alt px-1 font-mono text-xs">
              {"{{değişkenAdı}}"}
            </code>{" "}
            kullanın.
          </>
        }
      />

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Şablon ara (anahtar, ad, grup, konu)..."
        className="w-full sm:w-80"
      />

      {isLoading ? (
        <SectionCard>
          <p className="text-center text-muted">Yükleniyor...</p>
        </SectionCard>
      ) : visible.length === 0 ? (
        <SectionCard>
          <p className="text-center text-muted">
            {q ? "Aramayla eşleşen şablon yok" : "Şablon bulunamadı"}
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <SectionCard key={group} title={group}>
              <DataTable
                columns={columns}
                data={visible.filter((t) => t.group === group)}
                getRowId={(t) => t.key}
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
