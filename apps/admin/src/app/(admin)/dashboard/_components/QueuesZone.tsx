"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, EmptyState, Skeleton, cn } from "@tarodan/ui";
import type { DashboardQueueTile } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { fmtNumber, fmtTry } from "@/lib/format";
import { QUEUE_PRESENTATION } from "../_lib/zoneConfig";
import { queueAge } from "../_lib/queueAge";

const TONE_ICON = {
  primary: "bg-primary-500/10 text-primary-500",
  info: "bg-info-500/10 text-info-500",
  success: "bg-success-500/10 text-success-500",
  warning: "bg-warning-500/10 text-warning-500",
  danger: "bg-danger-500/10 text-danger-500",
} as const;

function QueueTile({ tile }: { tile: DashboardQueueTile }) {
  const t = useTranslations();
  const presentation = QUEUE_PRESENTATION[tile.key];
  const Icon = presentation.icon;
  const age = queueAge(tile.oldestAt);
  const lines = tile.parts.filter((part) => part.count > 0);

  return (
    <Card variant="bordered" className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            TONE_ICON[presentation.tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={tile.href}
            className="truncate text-sm font-medium text-heading hover:underline"
          >
            {t(presentation.labelKey)}
          </Link>
          {/* The age is what turns a count into a priority. */}
          <p className="truncate text-xs text-muted">
            {age
              ? t("admin.dashboard.age.oldest", {
                  age: t(age.unitKey, { count: age.count }),
                })
              : "—"}
          </p>
        </div>
        <span className="shrink-0 text-2xl font-semibold tabular-nums text-heading">
          {fmtNumber(tile.total)}
        </span>
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {lines.map((part) => (
            <li key={part.key}>
              <Link
                href={part.href}
                className="flex items-baseline justify-between gap-2 py-0.5 text-xs text-body hover:underline"
              >
                <span className="truncate">
                  {t(`admin.dashboard.queueParts.${part.key}` as MessageKey)}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-heading">
                  {part.amount === undefined
                    ? fmtNumber(part.count)
                    : `${fmtNumber(part.count)} · ${fmtTry(part.amount)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Zone A — what is waiting for an operator right now. Tiles with nothing in
 * them stay on screen so the grid does not reflow every minute, but they read
 * as empty.
 */
export function QueuesZone({
  queues,
  isLoading,
  isError,
}: {
  queues: DashboardQueueTile[];
  isLoading: boolean;
  isError: boolean;
}) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-heading">
          {t("admin.dashboard.zones.queues")}
        </h2>
        <p className="text-xs text-muted">
          {t("admin.dashboard.zones.queuesDescription")}
        </p>
      </div>

      {isError ? (
        <EmptyState
          size="compact"
          title={t("admin.dashboard.zones.loadFailed")}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : queues.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("admin.dashboard.zones.queuesEmpty")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {queues.map((tile) => (
            <QueueTile key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </section>
  );
}
