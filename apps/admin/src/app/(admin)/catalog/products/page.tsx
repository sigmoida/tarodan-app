/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { usePrompt } from "@/provider/PromptProvider";
import { useTabParam } from "@/hooks/useTabParam";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { type Product, getProductTabs } from "./_lib/types";
import { ProductsCountText } from "./_components/ProductsCountText";
import { ProductsExport } from "./_components/ProductsExport";
import { ProductFilters } from "./_components/ProductFilters";
import { ProductsTable } from "./_components/ProductsTable";

export default function ProductsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [tab, setTab] = useTabParam("list");

  const approve = useAdminMutation(
    (id: string) => adminApi.approveProduct(id),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.approved"),
    },
  );
  const reject = useAdminMutation(
    (v: { id: string; reason: string }) =>
      adminApi.rejectProduct(v.id, v.reason),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.rejected"),
    },
  );
  const del = useAdminMutation((id: string) => adminApi.deleteProduct(id), {
    invalidates: ["products"],
    successMessage: t("admin.catalog.products.removed"),
  });
  const restore = useAdminMutation(
    (id: string) => adminApi.restoreProduct(id),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.restored"),
    },
  );

  const onApprove = async (p: Product) => {
    await confirm({
      title: t("admin.catalog.products.approveTitle"),
      description: t("admin.catalog.products.approveDescription", {
        title: p.title,
      }),
      confirmLabel: t("admin.catalog.products.approve"),
      onConfirm: () => approve.mutateAsync(p.id),
    });
  };
  const onReject = async (p: Product) => {
    const reason = await prompt({
      title: t("admin.catalog.products.rejectTitle"),
      label: t("admin.catalog.products.rejectReasonLabel"),
      placeholder: t("admin.catalog.products.rejectReasonPlaceholder"),
      confirmLabel: t("admin.catalog.products.reject"),
      destructive: true,
      requiredMessage: t("admin.catalog.products.rejectReasonRequired"),
    });
    if (reason === null) return;
    reject.mutate({ id: p.id, reason });
  };
  const onDelete = async (p: Product) => {
    await confirm({
      title: t("admin.catalog.products.removeTitle"),
      description: t("admin.catalog.products.removeDescription"),
      confirmLabel: t("common.remove"),
      destructive: true,
      onConfirm: () => del.mutateAsync(p.id),
    });
  };
  const onRestore = async (p: Product) => {
    await confirm({
      title: t("admin.catalog.products.restoreTitle"),
      description: t("admin.catalog.products.restoreDescription"),
      confirmLabel: t("admin.catalog.products.restore"),
      onConfirm: () => restore.mutateAsync(p.id),
    });
  };

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.products.title")}
        description={<ProductsCountText />}
      >
        <ProductsExport />
      </PageHeader>
      <AdminTabs tabs={getProductTabs(t)} value={tab} onChange={setTab} />

      {tab === "ai" ? (
        <ModerationEventsPanel entityType="product" chrome={false} />
      ) : (
        <ResourceList<Product>
          resource="products"
          fetcher={(params) => adminApi.getProducts(params)}
          getRowId={(p) => p.id}
          syncUrl
          initialFilters={{
            status: "all",
            sellerId: "",
            brandId: "",
            carModelId: "",
          }}
          errorMessage={t("admin.catalog.products.loadError")}
        >
          <ResourceList.Toolbar>
            <ResourceList.Search
              placeholder={t("admin.catalog.products.searchPlaceholder")}
            />
            <ProductFilters />
          </ResourceList.Toolbar>
          <ProductsTable
            onApprove={onApprove}
            onReject={onReject}
            onDelete={onDelete}
            onRestore={onRestore}
            busyId={
              approve.isPending
                ? approve.variables
                : reject.isPending
                  ? reject.variables?.id
                  : del.isPending
                    ? del.variables
                    : restore.isPending
                      ? restore.variables
                      : undefined
            }
          />
          <ResourceList.Pagination />
        </ResourceList>
      )}
    </AdminPage>
  );
}
