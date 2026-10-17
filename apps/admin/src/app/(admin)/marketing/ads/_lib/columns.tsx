import Image from "next/image";
import {
  CellText,
  COL_SIZE,
  COL_WIDTH,
  col,
  Empty,
  TableBadge,
  TruncatedText,
  type RowActionItem,
} from "@/components/table";
import { fmtPercent } from "@/lib/format";
import { type Ad, platformShortLabels, positionLabels } from "./types";
import { AD_STATUS_VARIANT, adLiveStatus, adShadowScope } from "./status";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface AdColumnProps {
  onToggle: (ad: Ad) => void;
  togglingId?: string;
  rowMenu: (ad: Ad) => RowActionItem[];
}

/** `728×90` — reklamın piksel boyutu; boyutsuz (metin) reklamda yok. */
export function adSizeLabel(ad: Pick<Ad, "width" | "height">): string | null {
  return ad.width && ad.height ? `${ad.width}×${ad.height}` : null;
}

/**
 * Sadeleştirilmiş tablo: renkli rozet yalnız "Yayın durumu"nda. Pozisyon ve
 * platform düz metin (platform tabloya özel kısa etiketle), IAB uyumu boyutun
 * yanında ikonsuz çerçeve rozet ("IAB" / "IAB dışı"), açık/kapalı kompakt bir
 * anahtar + yanında durum metni.
 */
export function adColumns(
  { onToggle, togglingId, rowMenu }: AdColumnProps,
  t: T,
) {
  const positions = positionLabels(t);
  const platforms = platformShortLabels(t);
  const now = new Date();
  return [
    col.custom<Ad>(
      t("admin.marketing.ads.preview"),
      (ad) =>
        ad.imageUrl ? (
          <div className="relative h-12 w-20 overflow-hidden rounded bg-surface-alt">
            <Image
              src={ad.imageUrl}
              alt={ad.title}
              fill
              className="object-contain"
              sizes="80px"
            />
          </div>
        ) : (
          <Empty />
        ),
      { ...COL_SIZE.preview, sortKey: "imageUrl", sortType: "text" },
    ),
    col.title<Ad>(t("common.title"), (ad) => ({ title: ad.title }), {
      sortKey: "title",
      sortType: "text",
    }),
    col.custom<Ad>(
      t("admin.marketing.ads.size"),
      (ad) => {
        const size = adSizeLabel(ad);
        if (!size) return <Empty />;
        return (
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <CellText value={size} />
            {ad.iabCompliant ? (
              <TableBadge variant="outline" tooltip={ad.iabSize ?? undefined}>
                {t("admin.marketing.ads.iabBadge")}
              </TableBadge>
            ) : (
              <TableBadge variant="outline">
                {t("admin.marketing.ads.nonIabBadge")}
              </TableBadge>
            )}
          </div>
        );
      },
      { ...COL_SIZE.size, sortKey: "width", sortType: "number" },
    ),
    col.text<Ad>(
      t("admin.marketing.ads.positionLabel"),
      (ad) => positions[ad.position] || ad.position,
      { ...COL_SIZE.label, sortKey: "position", sortType: "text" },
    ),
    col.text<Ad>(
      t("admin.marketing.ads.platformLabel"),
      (ad) => platforms[ad.platform] || ad.platform,
      { ...COL_SIZE.label, sortKey: "platform", sortType: "text" },
    ),
    col.dateRange<Ad>(
      t("admin.marketing.ads.schedule"),
      (ad) => ({ start: ad.startDate, end: ad.endDate }),
      { sortKey: "startDate" },
    ),
    col.status<Ad>(
      t("admin.marketing.ads.liveStatusLabel"),
      (ad) => {
        const status = adLiveStatus(ad, now);
        const scope = adShadowScope(ad);
        const full = t(`admin.marketing.ads.liveStatus.${status}`, { scope });
        // Gölgedeki reklamın tam cümlesi rozete sığmaz: kısa etiket (nerede
        // gizli olduğuyla) + ipucunda tam cümle.
        return status === "shadowed"
          ? {
              variant: AD_STATUS_VARIANT[status],
              children: t("admin.marketing.ads.liveStatusShort.shadowed", {
                scope,
              }),
              tooltip: full,
            }
          : { variant: AD_STATUS_VARIANT[status], children: full };
      },
      { ...COL_SIZE.statusLong, sortable: false },
    ),
    col.toggle<Ad>(
      t("common.status"),
      (ad) => ({
        checked: ad.isActive,
        onChange: () => onToggle(ad),
        disabled: togglingId === ad.id,
        label: `${t("common.status")}: ${ad.title}`,
        stateText: ad.isActive ? t("common.active") : t("common.inactive"),
      }),
      { sortKey: "isActive", sortType: "number" },
    ),
    // Yalnız görselli reklamın tıklanabilir alanı olur; metin reklamda "—".
    col.number<Ad>(
      t("admin.marketing.ads.hotspots.column"),
      (ad) => (ad.imageUrl ? (ad.hotspots?.length ?? 0) : null),
      { ...COL_SIZE.count, sortable: false },
    ),
    col.custom<Ad>(
      t("admin.marketing.ads.statistics"),
      (ad) => (
        <div className="min-w-0">
          <TruncatedText className="text-body">
            {t("admin.marketing.ads.clickCount", { count: ad.clickCount })}
          </TruncatedText>
          <TruncatedText className="text-xs text-muted">
            {t("admin.marketing.ads.impressionCount", {
              count: ad.impressionCount,
            })}
          </TruncatedText>
          <TruncatedText className="text-xs text-muted">
            {`${fmtPercent(ad.ctr, 2)} CTR`}
          </TruncatedText>
        </div>
      ),
      { minWidth: COL_WIDTH.text, sortKey: "clickCount", sortType: "number" },
    ),
    col.rowMenu<Ad>(rowMenu),
  ];
}
