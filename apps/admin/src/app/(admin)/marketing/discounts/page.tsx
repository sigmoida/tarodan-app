"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { useListExport } from "@/hooks/useListExport";
import { type Discount } from "./_lib/types";
import { discountFilterFields } from "./_lib/filters";
import { DiscountsStats } from "./_components/DiscountsStats";
import { DiscountsTable } from "./_components/DiscountsTable";
import { DiscountFormModal } from "./_modals/DiscountFormModal";
import { GenerateCodesModal } from "./_modals/GenerateCodesModal";
import { useTranslations } from "next-intl";

export default function DiscountsPage() {
  const t = useTranslations();
  const [modal, setModal] = useState<{ discount?: Discount } | null>(null);
  const [codesFor, setCodesFor] = useState<Discount | null>(null);

  const { download: exportCodes } = useListExport({ listState: false });
  const onExportCodes = (d: Discount) =>
    exportCodes({
      fetcher: () => adminApi.exportDiscountCodes(d.id),
      fallbackFilename: `voucher-codes-${d.code || d.id}.xlsx`,
    });

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.discounts.title")}
        description={t("admin.marketing.discounts.subtitle")}
      >
        <Button
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.marketing.discounts.newDiscount")}
        </Button>
      </PageHeader>

      <DiscountsStats />

      <ResourceList<Discount>
        resource="discounts"
        fetcher={(params) =>
          adminApi.get("/admin/discounts", {
            params: {
              page: params.page,
              limit: params.limit,
              search: params.search || undefined,
              scope:
                params.scope && params.scope !== "all"
                  ? params.scope
                  : undefined,
              isActive:
                params.isActive === "true"
                  ? true
                  : params.isActive === "false"
                    ? false
                    : undefined,
              sortBy: params.sortBy,
              sortOrder: params.sortOrder,
              sortType: params.sortType,
            },
          })
        }
        getRowId={(d) => d.id}
        limit={20}
        syncUrl
        filters={discountFilterFields(t)}
      >
        <ResourceList.Toolbar
          searchPlaceholder={t("admin.marketing.discounts.searchPlaceholder")}
        />
        <DiscountsTable
          onEdit={(discount) => setModal({ discount })}
          onGenerateCodes={(discount) => setCodesFor(discount)}
          onExportCodes={onExportCodes}
        />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <DiscountFormModal
          key={modal.discount?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          discount={modal.discount}
        />
      )}

      {codesFor && (
        <GenerateCodesModal
          key={codesFor.id}
          open
          onClose={() => setCodesFor(null)}
          discount={codesFor}
        />
      )}
    </AdminPage>
  );
}
