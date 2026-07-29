"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import {
  type Discount,
  scopeFilterOptions,
  activeFilterOptions,
} from "./_lib/types";
import { DiscountsStats } from "./_components/DiscountsStats";
import { DiscountsTable } from "./_components/DiscountsTable";
import { DiscountFormModal } from "./_modals/DiscountFormModal";
import { GenerateCodesModal } from "./_modals/GenerateCodesModal";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

export default function DiscountsPage() {
  const t = useTranslations();
  const [modal, setModal] = useState<{ discount?: Discount } | null>(null);
  const [codesFor, setCodesFor] = useState<Discount | null>(null);

  /** Download a discount's voucher codes as CSV (auth via adminApi). */
  const exportCodes = async (d: Discount) => {
    try {
      const res = await adminApi.get(`/admin/discounts/${d.id}/codes/export`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voucher-codes-${d.code || d.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("admin.marketing.discounts.codes.generateFailed"));
    }
  };

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
        initialFilters={{ scope: "all", isActive: "all" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search
            placeholder={t("admin.marketing.discounts.searchPlaceholder")}
          />
          <ResourceList.FilterSelect
            name="scope"
            options={scopeFilterOptions(t)}
            className="sm:w-44"
          />
          <ResourceList.FilterSelect
            name="isActive"
            options={activeFilterOptions(t)}
            className="sm:w-40"
          />
        </ResourceList.Toolbar>
        <DiscountsTable
          onEdit={(discount) => setModal({ discount })}
          onGenerateCodes={(discount) => setCodesFor(discount)}
          onExportCodes={exportCodes}
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
