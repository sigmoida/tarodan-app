"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { deletedIdentityColumns } from "../_lib/columns";
import type { DeletedIdentity } from "../_lib/types";

/** Arşiv salt okunur: satır aksiyonu ve toplu seçim bilinçli olarak yok. */
export function DeletedIdentitiesTable() {
  const t = useTranslations();

  return (
    <ResourceList.Table<DeletedIdentity>
      columns={deletedIdentityColumns(t)}
      emptyText={t("admin.deletedIdentities.empty")}
    />
  );
}
