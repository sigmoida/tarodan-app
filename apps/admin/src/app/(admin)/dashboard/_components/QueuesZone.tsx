"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, EmptyState, Skeleton } from "@tarodan/ui";
import type { DashboardQueueTile } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { TextLink } from "@/components/TextLink";
import { fmtNumber, fmtTry } from "@/lib/format";
import { QUEUE_PRESENTATION } from "../_lib/zoneConfig";
import { ZoneHeader } from "./ZoneHeader";
import { queueAge } from "../_lib/queueAge";

/**
 * A queue: its label (a link to the screen), the age of the oldest item and
 * the count. Laid out like a `MetricCard` — the link is why it is its own
 * component.
 */
function QueueTile({ tile }: { tile: DashboardQueueTile }) {
  const t = useTranslations();
  const presentation = QUEUE_PRESENTATION[tile.key];
  const age = queueAge(tile.oldestAt);
  const lines = tile.parts.filter((part) => part.count > 0);

  return (
    <Card variant="bordered" className="flex flex-col gap-3 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TextLink href={tile.href} className="block truncate text-sm">
            {t(presentation.labelKey)}
          </TextLink>
          {/* The age is what turns a count into a priority. */}
          <p className="truncate text-xs text-muted">
            {age
              ? t("admin.dashboard.age.oldest", {
                  age: t(age.unitKey, { count: age.count }),
                })
              : "—"}
          </p>
        </div>
        <span className="shrink-0 text-2xl font-bold tabular-nums text-heading">
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
      <ZoneHeader
        title={t("admin.dashboard.zones.queues")}
        description={t("admin.dashboard.zones.queuesDescription")}
      />

      {isError ? (
        <EmptyState
          size="compact"
          title={t("admin.dashboard.zones.loadFailed")}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queues.map((tile) => (
            <QueueTile key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </section>
  );
}
