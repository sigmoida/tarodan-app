"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@tarodan/ui";
import type { DashboardListingRemovalsResponse } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { Eyebrow, SectionTitle } from "@/components/detail/SectionTitle";
import { ProgressBar } from "@/components/ProgressBar";
import { fmtNumber } from "@/lib/format";
import {
  removalActorLabel,
  removalPlatformLabel,
  removalReasonLabel,
  violationLabel,
} from "@/lib/listing-removal";
import {
  toListingRemovalsView,
  type RemovalShareRow,
} from "../_lib/listingRemovals";

/** Bir kırılım satırı: etiket, adet ve bölüm içi pay. */
function ShareRow<K>({
  row,
  label,
}: {
  row: RemovalShareRow<K>;
  label: ReactNode;
}) {
  const t = useTranslations();
  return (
    <li className="flex flex-col gap-1 py-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate text-body">{label}</span>
        <span className="shrink-0 tabular-nums font-medium text-heading">
          {fmtNumber(row.count)}
          <span className="ml-1 text-xs font-normal text-muted">
            {t("admin.dashboard.removals.share", { share: row.share })}
          </span>
        </span>
      </div>
      <ProgressBar value={row.share} />
    </li>
  );
}

function Column({
  title,
  total,
  children,
}: {
  title: string;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="border-b border-border pb-1">
        <SectionTitle
          as="h3"
          size="sm"
          actions={
            <span className="tabular-nums text-sm font-normal text-muted">
              {fmtNumber(total)}
            </span>
          }
        >
          {title}
        </SectionTitle>
      </div>
      {children}
    </div>
  );
}

/**
 * Zone C kırılımı — seçili dönemde vitrinden düşen ilanlar: kaldırana göre
 * gruplanmış nedenler, başka platformda satışın platform dağılımı ve kural
 * ihlallerinin kod dağılımı. Dönem kartlarıyla AYNI dönem seçimini okur;
 * sayım API'de olay damgasıyla (kaldırma anı) yapılır.
 */
export function ListingRemovalsPanel({
  data,
  isLoading,
  isError,
}: {
  data: DashboardListingRemovalsResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const t = useTranslations();
  const view = toListingRemovalsView(data);

  return (
    <SectionCard
      title={t("admin.dashboard.removals.title")}
      actions={
        !isLoading && !isError ? (
          <span className="text-sm text-muted">
            {t("admin.dashboard.removals.total")}:{" "}
            <span className="tabular-nums font-semibold text-heading">
              {fmtNumber(view.total)}
            </span>
          </span>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-4"
    >
      <p className="text-xs text-muted">
        {t("admin.dashboard.removals.description")}
      </p>

      {isError ? (
        <EmptyState
          size="compact"
          title={t("admin.dashboard.zones.loadFailed")}
        />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : view.isEmpty ? (
        <EmptyState
          size="compact"
          title={t("admin.dashboard.removals.empty")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Column
            title={t("admin.dashboard.removals.byReason")}
            total={view.total}
          >
            {view.byActor.map((group) => (
              <div key={group.actor} className="flex flex-col">
                <Eyebrow>
                  {removalActorLabel(group.actor, t)} · {fmtNumber(group.count)}
                </Eyebrow>
                <ul>
                  {group.reasons.map((row) => (
                    <ShareRow
                      key={row.key}
                      row={row}
                      label={removalReasonLabel(row.key, t)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </Column>

          <Column
            title={t("admin.dashboard.removals.soldElsewhere")}
            total={view.soldElsewhereTotal}
          >
            {view.platforms.length === 0 ? (
              <p className="text-sm text-subtle">—</p>
            ) : (
              <ul>
                {view.platforms.map((row) => (
                  <ShareRow
                    key={row.key}
                    row={row}
                    label={removalPlatformLabel(row.key, t)}
                  />
                ))}
              </ul>
            )}
          </Column>

          <Column
            title={t("admin.dashboard.removals.violations")}
            total={view.violationTotal}
          >
            {view.violations.length === 0 ? (
              <p className="text-sm text-subtle">—</p>
            ) : (
              <ul>
                {view.violations.map((row) => (
                  <ShareRow
                    key={row.key ?? "none"}
                    row={row}
                    label={
                      row.key
                        ? violationLabel(row.key, t)
                        : t("admin.dashboard.removals.noViolationCode")
                    }
                  />
                ))}
              </ul>
            )}
          </Column>
        </div>
      )}

      <p className="text-xs text-subtle">
        {t("admin.dashboard.removals.unknownNote")}
      </p>
    </SectionCard>
  );
}
