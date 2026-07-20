/** @format */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useTabParam } from "@/hooks/useTabParam";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { Collection } from "./_lib/types";
import { collectionColumns } from "./_lib/columns";
import { CollectionFormModal } from "./_modals/CollectionFormModal";

export default function CollectionsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [tab, setTab] = useTabParam("list");
  const [modal, setModal] = useState<{ collection?: Collection } | null>(null);

  const COLLECTION_TABS = [
    { key: "list", label: t("admin.catalog.collections.title") },
    { key: "ai", label: t("admin.catalog.common.aiModeration") },
  ];

  const PUBLIC_OPTIONS = [
    { value: "all", label: t("admin.catalog.collections.allVisibility") },
    { value: "true", label: t("admin.catalog.collections.visible") },
    { value: "false", label: t("admin.catalog.collections.hidden") },
  ];
  const FEATURED_OPTIONS = [
    { value: "all", label: t("common.all") },
    { value: "true", label: t("admin.catalog.collections.featured") },
  ];

  const del = useAdminMutation((id: string) => adminApi.deleteCollection(id), {
    invalidates: ["collections"],
    successMessage: t("admin.catalog.collections.deleted"),
  });
  const toggle = useAdminMutation(
    (c: Collection) => adminApi.setCollectionVisibility(c.id, !c.isPublic),
    { invalidates: ["collections"] },
  );

  const onDelete = useCallback(
    async (c: Collection) => {
      await confirm({
        title: t("admin.catalog.collections.deleteTitle"),
        description: t("admin.catalog.collections.deleteDescription"),
        destructive: true,
        onConfirm: () => del.mutateAsync(c.id),
      });
    },
    [confirm, del, t],
  );

  const columns = useMemo(
    () =>
      collectionColumns(t, {
        onToggleVisibility: (c) => toggle.mutate(c),
        onEdit: (c) => setModal({ collection: c }),
        onDelete,
        busyId: toggle.isPending ? toggle.variables?.id : undefined,
      }),
    [t, onDelete, toggle],
  );

  // Chrome (title + New button + tabs) is page-level and persists across tab
  // switches; only the content below swaps and suspends (like operations/shipping).
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.collections.title")}
        description={t("admin.catalog.collections.subtitle")}
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.catalog.collections.new")}
        </Button>
      </PageHeader>
      <AdminTabs tabs={COLLECTION_TABS} value={tab} onChange={setTab} />

      {tab === "ai" ? (
        <ModerationEventsPanel entityType="collection" chrome={false} />
      ) : (
        <ResourceList<Collection>
          resource="collections"
          fetcher={(params) =>
            adminApi.getCollections({
              page: params.page,
              limit: params.limit,
              search: params.search,
              isPublic:
                params.isPublic !== undefined
                  ? params.isPublic === "true"
                  : undefined,
              isFeatured:
                params.isFeatured !== undefined
                  ? params.isFeatured === "true"
                  : undefined,
              sortBy: params.sortBy,
              sortOrder: params.sortOrder,
            })
          }
          getRowId={(c) => c.id}
          syncUrl
          initialFilters={{
            isPublic: "all",
            isFeatured: "all",
          }}
        >
          <ResourceList.Toolbar>
            <ResourceList.Search />
            <ResourceList.FilterSelect
              name="isPublic"
              options={PUBLIC_OPTIONS}
              className="sm:w-44"
            />
            <ResourceList.FilterSelect
              name="isFeatured"
              options={FEATURED_OPTIONS}
              className="sm:w-40"
            />
          </ResourceList.Toolbar>
          <ResourceList.Table
            columns={columns}
            emptyText={t("admin.catalog.collections.empty")}
          />
          <ResourceList.Total unit={t("admin.catalog.collections.unit")} />
          <ResourceList.Pagination />
        </ResourceList>
      )}

      {modal && (
        <CollectionFormModal
          key={modal.collection?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          collection={modal.collection}
        />
      )}
    </AdminPage>
  );
}
