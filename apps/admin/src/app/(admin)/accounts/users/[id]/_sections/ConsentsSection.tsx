/** @format */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import {
  CONSENT_DOCUMENT_I18N_KEYS,
  CONSENT_SOURCE_I18N_KEYS,
  type ConsentDocumentStatus,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useAdminItem } from "@/hooks/useAdminItem";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { SuspenseBoundary } from "@/components/page/SuspenseBoundary";
import { CONSENT_STATUS_BADGE, consentStatusTone } from "../_lib/consentStatus";

/**
 * Kullanıcı dosyasındaki onaylar: belge başına en son kayıt ve üyenin bir
 * sonraki girişte yeniden onaya çağrılıp çağrılmayacağı. Geçmişin tamamı Onay
 * Kayıtları ekranında, üyeye daraltılmış olarak açılır.
 *
 * Kendi yükleme sınırı vardır: bölüm yüklenirken dosyanın geri kalanı beklemez.
 */
export function ConsentsSection({ userId }: { userId: string }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.consents.userSection.title")}
      actions={
        <Link
          href={`/accounts/consents?userId=${userId}`}
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          {t("admin.consents.userSection.viewAll")}
        </Link>
      }
    >
      <SuspenseBoundary>
        <ConsentStatusList userId={userId} />
      </SuspenseBoundary>
    </SectionCard>
  );
}

function ConsentStatusList({ userId }: { userId: string }) {
  const t = useTranslations();
  const { item } = useAdminItem<{ documents: ConsentDocumentStatus[] }>({
    resource: "consents",
    id: userId,
    fetcher: (id) => adminApi.getUserConsentStatus(id).then((r) => r.data),
  });

  return (
    <DataList columns={1}>
      {(item?.documents ?? []).map((status) => {
        const badge = CONSENT_STATUS_BADGE[consentStatusTone(status)];
        return (
          <Field
            key={status.document}
            label={t(CONSENT_DOCUMENT_I18N_KEYS[status.document])}
          >
            <span className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
              {status.latest && (
                <span className="text-xs font-normal text-muted">
                  {t("admin.consents.userSection.latest", {
                    version: status.latest.version,
                    date: fmtDateTime(status.latest.createdAt) ?? "",
                    source: t(CONSENT_SOURCE_I18N_KEYS[status.latest.source]),
                  })}
                </span>
              )}
            </span>
          </Field>
        );
      })}
    </DataList>
  );
}
