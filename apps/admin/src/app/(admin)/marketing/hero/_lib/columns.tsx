import { Badge } from "@tarodan/ui";
import type { ContentPlatform, HeroHomeVisibilityDto } from "@tarodan/types";
import { StatusToggle } from "@/components/ActiveBadge";
import { col, type RowActionItem } from "@/components/table";
import { fmtDate } from "@/lib/format";
import type { useTranslations } from "next-intl";
import { previewText } from "./preview";
import { heroRowStatus } from "./status";
import type { HeroSlide } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export interface HeroColumnProps {
  onToggle: (slide: HeroSlide) => void;
  togglingId?: string;
  rowMenu: (slide: HeroSlide) => RowActionItem[];
  /** Ana sayfa sekmesinde platform anahtarları (yayın durumu buna göre). */
  homeVisibility?: HeroHomeVisibilityDto;
}

/** Platform rozeti: tek platform outline, ikisi birden vurgulu. */
const PLATFORM_VARIANT: Record<ContentPlatform, "outline" | "default"> = {
  web: "outline",
  app: "outline",
  all: "default",
};

/** CTA'lar: etiket + altı çizili adres; ikisi de yoksa boş. */
function CtaCell({ slide }: { slide: HeroSlide }) {
  const ctas = [
    { label: slide.cta1Label, href: slide.cta1Href },
    { label: slide.cta2Label, href: slide.cta2Href },
  ].filter((c) => c.label);
  if (ctas.length === 0) return <span className="text-sm text-muted">—</span>;
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      {ctas.map((c, i) => (
        <p key={i} className="truncate">
          <span className="text-heading">{previewText(c.label, "tr")}</span>{" "}
          <span className="text-primary-600 underline underline-offset-2">
            {c.href}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Sütunlar kasıtlı olarak sıralanamaz: liste `displayOrder` sırasında gelir ve
 * yukarı/aşağı eylemleri bu sıraya göre çalışır.
 */
export function heroColumns(
  { onToggle, togglingId, rowMenu, homeVisibility }: HeroColumnProps,
  t: T,
) {
  const now = new Date();
  const noSort = { sortable: false } as const;
  return [
    col.custom<HeroSlide>(
      t("admin.marketing.hero.columns.image"),
      (s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.imageUrl}
          alt={previewText(s.imageAlt ?? s.title, "tr")}
          className="h-12 w-20 rounded bg-surface-alt object-cover"
        />
      ),
      { grow: 1, minWidth: 104, ...noSort },
    ),
    col.custom<HeroSlide>(
      t("common.title"),
      (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-heading">
            {previewText(s.title, "tr")}
          </p>
          <p className="truncate text-xs text-muted">
            {previewText(s.subtitle, "tr")}
          </p>
        </div>
      ),
      { grow: 3, minWidth: 200, ...noSort },
    ),
    col.badge<HeroSlide>(
      t("admin.marketing.hero.columns.platform"),
      (s) => (
        <Badge variant={PLATFORM_VARIANT[s.platform]} size="sm">
          {t(`admin.marketing.hero.platformBadge.${s.platform}`)}
        </Badge>
      ),
      noSort,
    ),
    col.custom<HeroSlide>(
      t("admin.marketing.hero.columns.cta"),
      (s) => <CtaCell slide={s} />,
      { grow: 3, minWidth: 200, ...noSort },
    ),
    col.muted<HeroSlide>(
      t("admin.marketing.ads.schedule"),
      (s) =>
        s.startDate || s.endDate
          ? `${fmtDate(s.startDate) ?? "—"} – ${fmtDate(s.endDate) ?? "—"}`
          : null,
      { minWidth: 150, ...noSort },
    ),
    col.badge<HeroSlide>(
      t("admin.marketing.ads.liveStatusLabel"),
      (s) => {
        const { status, hiddenOn, variant } = heroRowStatus(
          s,
          now,
          homeVisibility,
        );
        return (
          <Badge variant={variant} size="sm">
            {hiddenOn
              ? t(`admin.marketing.hero.liveHidden.${hiddenOn}`)
              : t(`admin.marketing.ads.liveStatus.${status}`)}
          </Badge>
        );
      },
      noSort,
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.impressions"),
      (s) => s.impressionCount,
      { minWidth: 96, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.clicks"),
      (s) => s.clickCount,
      { minWidth: 80, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.cta1Clicks"),
      (s) => s.cta1ClickCount,
      { minWidth: 80, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.cta2Clicks"),
      (s) => s.cta2ClickCount,
      { minWidth: 80, ...noSort },
    ),
    col.badge<HeroSlide>(
      t("admin.marketing.hero.columns.ios"),
      (s) =>
        s.hideOnIos ? (
          <Badge variant="outline" size="sm">
            {t("admin.marketing.hero.hiddenOnIos")}
          </Badge>
        ) : null,
      noSort,
    ),
    col.custom<HeroSlide>(
      t("common.status"),
      (s) => (
        <StatusToggle
          active={s.isActive}
          busy={togglingId === s.id}
          onToggle={() => onToggle(s)}
        />
      ),
      { minWidth: 110, ...noSort },
    ),
    col.rowMenu<HeroSlide>(rowMenu),
  ];
}
