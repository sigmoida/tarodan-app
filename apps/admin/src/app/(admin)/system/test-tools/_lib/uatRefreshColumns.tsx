import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { TextLink } from "@/components/TextLink";
import type {
  UatRefreshMaskedCount,
  UatRefreshRun,
} from "@/lib/api/system.types";
import type { useTranslations } from "next-intl";
import {
  durationLabel,
  uatRefreshDurationMs,
  uatRefreshStateKey,
  uatRefreshStateVariant,
} from "./uatRefresh";

type T = ReturnType<typeof useTranslations<never>>;

/** Durum rozeti — kart özeti ve geçmiş tablosu aynı çizimi kullanır. */
export function UatRefreshStateBadge({
  run,
  t,
}: {
  run: Pick<UatRefreshRun, "state">;
  t: T;
}) {
  return (
    <Badge variant={uatRefreshStateVariant(run.state)}>
      {t(uatRefreshStateKey(run.state))}
    </Badge>
  );
}

/** "12 dk 05 sn" — sürüyorsa `now`a kadar. */
export function runDurationText(run: UatRefreshRun, now: number, t: T): string {
  return durationLabel(uatRefreshDurationMs(run, now), (parts) =>
    t("admin.system.testTools.uatRefresh.duration", parts),
  );
}

/** Maskelenen satır sayıları (yoğun, kartın içine gömülü tablo). */
export const uatRefreshMaskedColumns = (t: T) => [
  col.text<UatRefreshMaskedCount>(
    t("admin.system.testTools.uatRefresh.last.maskedTable"),
    (r) => r.table,
  ),
  col.number<UatRefreshMaskedCount>(
    t("admin.system.testTools.uatRefresh.last.maskedRows"),
    (r) => r.rows,
  ),
];

/** Son 10 çalışma. */
export const uatRefreshHistoryColumns = (t: T, now: number) => [
  col.custom<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.state"),
    (r) => <UatRefreshStateBadge run={r} t={t} />,
  ),
  col.date<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.requestedAt"),
    (r) => r.requestedAt,
    { withTime: true },
  ),
  col.muted<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.requestedBy"),
    (r) =>
      r.requestedBy?.displayName ??
      t("admin.system.testTools.uatRefresh.last.requestedByGithub"),
  ),
  col.muted<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.duration"),
    (r) => runDurationText(r, now, t),
  ),
  col.custom<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.mode"),
    (r) => (
      <Badge variant="outline">
        {r.dryRun
          ? t("admin.system.testTools.uatRefresh.last.dryRun")
          : t("admin.system.testTools.uatRefresh.history.real")}
      </Badge>
    ),
  ),
  col.custom<UatRefreshRun>(
    t("admin.system.testTools.uatRefresh.history.run"),
    (r) =>
      r.workflowRunUrl ? (
        <TextLink href={r.workflowRunUrl} external>
          {t("admin.system.testTools.uatRefresh.last.openRun")}
        </TextLink>
      ) : (
        "—"
      ),
  ),
];
