import type { HeroHomeVisibilityDto } from "@tarodan/types";
import {
  COL_SIZE,
  COL_WIDTH,
  col,
  Empty,
  TruncatedText,
  type RowActionItem,
} from "@/components/table";
import type { useTranslations } from "next-intl";
import { platformShortLabels } from "../../ads/_lib/types";
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

/** CTA'lar: satır başına etiket (normal metin) + adres (soluk); ikisi de yoksa boş. */
function CtaCell({ slide }: { slide: HeroSlide }) {
  const ctas = [
    { label: slide.cta1Label, href: slide.cta1Href },
    { label: slide.cta2Label, href: slide.cta2Href },
  ].filter((c) => c.label);
  if (ctas.length === 0) return <Empty />;
  return (
    <div className="min-w-0 space-y-0.5">
      {ctas.map((c, i) => (
        <div
          key={i}
          className="flex min-w-0 items-baseline gap-1 overflow-hidden"
        >
          <TruncatedText className="min-w-0 max-w-[60%] text-body">
            {previewText(c.label, "tr")}
          </TruncatedText>
          {c.href && (
            <TruncatedText className="min-w-0 flex-1 text-xs text-muted">
              {c.href}
            </TruncatedText>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Sütunlar kasıtlı olarak sıralanamaz: liste `displayOrder` sırasında gelir ve
 * yukarı/aşağı eylemleri bu sıraya göre çalışır.
 *
 * Reklam tablosuyla aynı kurallar: renkli rozet yalnız "Yayın durumu"nda
 * (platformda gizliyse uyarı tonu — `heroRowStatus`), platform düz metin (kısa
 * tablo etiketi), açık/kapalı kompakt anahtar + durum metni.
 */
export function heroColumns(
  { onToggle, togglingId, rowMenu, homeVisibility }: HeroColumnProps,
  t: T,
) {
  const now = new Date();
  const noSort = { sortable: false } as const;
  const platforms = platformShortLabels(t);
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
      { ...COL_SIZE.preview, ...noSort },
    ),
    col.title<HeroSlide>(
      t("common.title"),
      (s) => ({
        title: previewText(s.title, "tr"),
        secondary: previewText(s.subtitle, "tr"),
      }),
      noSort,
    ),
    col.text<HeroSlide>(
      t("admin.marketing.hero.columns.platform"),
      (s) => platforms[s.platform] || s.platform,
      { ...COL_SIZE.label, ...noSort },
    ),
    col.custom<HeroSlide>(
      t("admin.marketing.hero.columns.cta"),
      (s) => <CtaCell slide={s} />,
      { minWidth: COL_WIDTH.description, ...noSort },
    ),
    col.dateRange<HeroSlide>(
      t("admin.marketing.ads.schedule"),
      (s) => ({ start: s.startDate, end: s.endDate }),
      noSort,
    ),
    col.status<HeroSlide>(
      t("admin.marketing.ads.liveStatusLabel"),
      (s) => {
        const { status, hiddenOn, variant } = heroRowStatus(
          s,
          now,
          homeVisibility,
        );
        return {
          variant,
          children: hiddenOn
            ? t(`admin.marketing.hero.liveHidden.${hiddenOn}`)
            : t(`admin.marketing.ads.liveStatus.${status}`),
        };
      },
      { ...COL_SIZE.statusLong, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.impressions"),
      (s) => s.impressionCount,
      { ...COL_SIZE.count, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.clicks"),
      (s) => s.clickCount,
      { ...COL_SIZE.count, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.cta1Clicks"),
      (s) => s.cta1ClickCount,
      { ...COL_SIZE.count, ...noSort },
    ),
    col.number<HeroSlide>(
      t("admin.marketing.hero.columns.cta2Clicks"),
      (s) => s.cta2ClickCount,
      { ...COL_SIZE.count, ...noSort },
    ),
    col.status<HeroSlide>(
      t("admin.marketing.hero.columns.ios"),
      (s) =>
        s.hideOnIos
          ? {
              variant: "outline",
              children: t("admin.marketing.hero.hiddenOnIos"),
            }
          : null,
      noSort,
    ),
    col.toggle<HeroSlide>(
      t("common.status"),
      (s) => ({
        checked: s.isActive,
        onChange: () => onToggle(s),
        disabled: togglingId === s.id,
        label: `${t("common.status")}: ${previewText(s.title, "tr")}`,
        stateText: s.isActive ? t("common.active") : t("common.inactive"),
      }),
      noSort,
    ),
    col.rowMenu<HeroSlide>(rowMenu),
  ];
}
