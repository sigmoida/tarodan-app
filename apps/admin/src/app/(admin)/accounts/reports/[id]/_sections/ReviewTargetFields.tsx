"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { reviewStatusConfig } from "@/components/reviews/reviewStatus";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { TextLink } from "@/components/TextLink";
import type { ReportTarget } from "../../_lib/detail";

/**
 * Şikayet edilen yorum (Apple 1.2): yazan, değerlendirilen (ürün ya da
 * satıcı), puan, yayın durumu (gizli mi) ve metnin kendisi. Gizleme / yeniden
 * gösterme yorum ekranında yapılır — sayfa başlığındaki "İçeriği aç" bağlantısı
 * yorumun çekmecesini açar.
 */
export function ReviewTargetFields({ target }: { target: ReportTarget }) {
  const t = useTranslations();
  const text = [target.title, target.comment].filter(Boolean).join("\n\n");

  return (
    <>
      <DataList columns={2}>
        <Field label={t("admin.reports.detail.reviewAuthor")}>
          {target.author && (
            <TextLink href={`/accounts/users/${target.author.id}`}>
              {target.author.displayName}
            </TextLink>
          )}
        </Field>
        <Field label={t("admin.reports.detail.reviewSubject")}>
          {target.reviewKind === "product" && target.product && (
            <TextLink href={`/catalog/products/${target.product.id}`}>
              {target.product.title}
            </TextLink>
          )}
          {target.reviewKind === "seller" && target.receiver && (
            <TextLink href={`/accounts/users/${target.receiver.id}`}>
              {target.receiver.displayName}
            </TextLink>
          )}
        </Field>
        <Field label={t("admin.reports.detail.reviewKind")}>
          {target.reviewKind === "seller"
            ? t("admin.reports.detail.reviewKindSeller")
            : t("admin.reports.detail.reviewKindProduct")}
        </Field>
        <Field label={t("admin.accounts.reviews.score")}>
          {target.score ?? "—"}
        </Field>
        <Field label={t("common.status")}>
          {target.status && (
            <Badge status={target.status} config={reviewStatusConfig(t)} />
          )}
        </Field>
      </DataList>
      <DataList columns={1} className="mt-4">
        <Field layout="stacked" label={t("admin.reports.detail.reviewContent")}>
          <Panel
            tone="muted"
            padding="sm"
            className="whitespace-pre-wrap font-normal text-body"
          >
            {text || (
              <span className="text-subtle">
                {t("admin.reports.detail.reviewNoText")}
              </span>
            )}
          </Panel>
        </Field>
      </DataList>
    </>
  );
}
