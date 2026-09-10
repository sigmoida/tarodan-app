/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { deletedIdentityFilterFields } from "./_lib/filters";
import { mapDeletedIdentities, type DeletedIdentity } from "./_lib/types";
import { DeletedIdentitiesTable } from "./_components/DeletedIdentitiesTable";
import { DeletedIdentitiesExport } from "./_components/DeletedIdentitiesExport";

/**
 * Silinen hesapların kimlik arşivi.
 *
 * Hesap silme kimliği (e-posta, telefon, ad, VKN) geri dönülemez şekilde
 * anonimleştiriyor; bu ekran, aylık resmî bildirim için silme ÖNCESİ alınan
 * snapshot'ları gösterir. Salt okunur: kayıtlar DB tetikleyicisiyle silinemez.
 */
export default function DeletedIdentitiesPage() {
  const t = useTranslations();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.deletedIdentities.title")}
        description={t("admin.deletedIdentities.description")}
      />

      <DeletedIdentitiesExport />

      <ResourceList<DeletedIdentity>
        resource="deleted-identities"
        fetcher={(params) =>
          adminApi.getDeletedIdentities(params).then((res) => {
            const root = res.data ?? {};
            const raw = root.data ?? [];
            return {
              ...res,
              data: {
                data: mapDeletedIdentities(raw),
                meta: { total: root.meta?.total ?? raw.length },
              },
            };
          })
        }
        getRowId={(row) => row.id}
        syncUrl
        filters={deletedIdentityFilterFields(t)}
      >
        <ResourceList.Toolbar />
        <DeletedIdentitiesTable />
        <ResourceList.Pagination />
      </ResourceList>

      <p className="text-muted text-sm">
        {t("admin.deletedIdentities.retentionNotice")}
      </p>
    </AdminPage>
  );
}
