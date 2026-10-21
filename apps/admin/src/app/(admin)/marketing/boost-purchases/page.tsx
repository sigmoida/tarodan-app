"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { usePackages } from "../ad-packages/_lib/usePackages";
import { type BoostPurchase } from "./_lib/types";
import { purchaseColumns } from "./_lib/columns";
import {
  boostPurchaseFilterFields,
  boostPurchaseListParams,
} from "./_lib/filters";
import { useBoostActionAccess } from "./_hooks/useBoostActionAccess";
import { GrantBoostModal } from "./_modals/GrantBoostModal";

export default function BoostPurchasesPage() {
  const t = useTranslations();
  const { data: packages } = usePackages();
  const access = useBoostActionAccess();
  const [granting, setGranting] = useState(false);

  const packageChoices = (packages ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const packageOptions = [
    { value: "all", label: t("admin.marketing.boostPurchases.allPackages") },
    ...packageChoices,
  ];

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.boostPurchases.title")}
        description={t("admin.marketing.boostPurchases.subtitle")}
      >
        {access.manage && (
          <Button
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setGranting(true)}
          >
            {t("admin.marketing.boostPurchases.grant.action")}
          </Button>
        )}
      </PageHeader>

      <ResourceList<BoostPurchase>
        resource="boost-purchases"
        fetcher={(params) =>
          adminApi.getBoostPurchases(boostPurchaseListParams(params))
        }
        getRowId={(p) => p.id}
        limit={20}
        syncUrl
        filters={boostPurchaseFilterFields(t, packageOptions)}
      >
        <ResourceList.Toolbar
          searchPlaceholder={t(
            "admin.marketing.boostPurchases.searchPlaceholder",
          )}
        />
        <ResourceList.Table
          columns={purchaseColumns(t)}
          emptyText={t("admin.marketing.boostPurchases.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>

      {granting && (
        <GrantBoostModal
          packages={packageChoices}
          onClose={() => setGranting(false)}
        />
      )}
    </AdminPage>
  );
}
