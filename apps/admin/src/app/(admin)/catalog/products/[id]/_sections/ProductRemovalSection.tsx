"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { productStatusConfig } from "@tarodan/ui";
import type { AdminListingRemovalEvent } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime } from "@/lib/format";
import { statusLabel } from "@/lib/statusLabels";
import {
  removalActorLabel,
  removalDetailLabel,
  removalReasonLabel,
} from "@/lib/listing-removal";

/**
 * Kaldırma geçmişi (yeniden eskiye): neden, kaldıran, platform / ihlal kodu,
 * serbest metin, statü geçişi ve tarih. Satıcının serbest metni yalnız bu
 * admin ekranında görünür. Bu özellikten önce düşen ilanın kaydı yoktur.
 */
export function ProductRemovalSection({
  history,
}: {
  history: AdminListingRemovalEvent[];
}) {
  const t = useTranslations();

  return (
    <SectionCard
      title={t("admin.catalog.products.removal.historyTitle")}
      bodyClassName="space-y-3"
    >
      {history.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.catalog.products.removal.historyEmpty")}
        </p>
      ) : (
        <>
          <ol className="divide-y divide-border">
            {history.map((event) => (
              <RemovalEventRow key={event.id} event={event} />
            ))}
          </ol>
          <p className="text-xs text-subtle">
            {t("admin.catalog.products.removal.detailAdminOnly")}
          </p>
        </>
      )}
    </SectionCard>
  );
}

function RemovalEventRow({ event }: { event: AdminListingRemovalEvent }) {
  const t = useTranslations();
  const detailLabel = removalDetailLabel(event, t);

  return (
    <li className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-heading">
          {removalReasonLabel(event.reason, t)}
        </span>
        <span className="text-xs text-muted">
          {fmtDateTime(event.createdAt)}
        </span>
      </div>
      <p className="text-muted">
        {removalActorLabel(event.actor, t)}
        {event.actorUserId && (
          <>
            {" · "}
            <Link
              href={`/accounts/users/${event.actorUserId}`}
              className="text-primary-600 hover:underline"
            >
              {t("admin.catalog.products.removal.actorUser")}
            </Link>
          </>
        )}
      </p>
      {detailLabel && (
        <p>
          <span className="text-muted">
            {event.reason === "sold_elsewhere"
              ? t("admin.catalog.products.removal.platform")
              : t("admin.catalog.products.removal.violation")}
          </span>{" "}
          {detailLabel}
        </p>
      )}
      {event.detail && (
        <p className="whitespace-pre-line break-words">
          <span className="text-muted">
            {t("admin.catalog.products.removal.detail")}
          </span>{" "}
          {event.detail}
        </p>
      )}
      {!event.fromStorefront && (
        // Kayıt geçmişte kalır ama dashboard'daki vitrinden düşüş sayısına girmez.
        <p className="text-xs text-subtle">
          {t("admin.catalog.products.removal.notFromStorefront")}
        </p>
      )}
      <p className="text-xs text-muted">
        {t("admin.catalog.products.removal.statusChange")}:{" "}
        {statusLabel(productStatusConfig, event.statusBefore, t)} →{" "}
        {statusLabel(productStatusConfig, event.statusAfter, t)}
      </p>
    </li>
  );
}
