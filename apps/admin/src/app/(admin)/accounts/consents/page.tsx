/** @format */

"use client";

import { useTranslations } from "next-intl";
import type { AdminConsentRecordRow } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { consentFilterFields } from "./_lib/filters";
import { ConsentsTable } from "./_components/ConsentsTable";
import { ConsentsExportButton } from "./_components/ConsentsExportButton";

/**
 * Onay Kayıtları — kullanıcıların verdiği hukuki onayların ispatı: kim, hangi
 * belgeyi, hangi sürümüyle, ne zaman ve nereden (IP / tarayıcı) onayladı ya
 * da geri çekti. Salt okunur: kayıtlar DB tetikleyicisiyle değişmez.
 *
 * `userId` kontrolü olmayan bir derin bağlantı filtresidir — kullanıcı
 * dosyasındaki "Tüm kayıtlar" bağlantısı buraya üyeye daraltılmış gelir.
 */
export default function ConsentsPage() {
  const t = useTranslations();

  return (
    <ResourceList<AdminConsentRecordRow>
      resource="consents"
      fetcher={(params) => adminApi.getConsents(params)}
      getRowId={(row) => row.id}
      syncUrl
      filters={consentFilterFields(t)}
      initialFilters={{ userId: "" }}
    >
      <ResourceList.Header
        title={t("admin.consents.title")}
        description={
          <>
            {t("admin.consents.description")}{" "}
            <DeepLinkFilterSummary
              totalLabel={(count) => t("admin.consents.totalCount", { count })}
            />
          </>
        }
      />
      <ResourceList.Toolbar searchPlaceholder={t("admin.consents.search")}>
        <ConsentsExportButton />
      </ResourceList.Toolbar>
      <ConsentsTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
