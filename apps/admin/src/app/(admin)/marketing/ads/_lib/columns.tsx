import Image from "next/image";
import { Badge, Button } from "@tarodan/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
} from "@heroicons/react/24/outline";
import { col, type RowActionItem } from "@/components/table";
import { type Ad, positionLabels, deviceLabels } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

function DeviceIcon({ type }: { type: string }) {
  if (type === "desktop") return <ComputerDesktopIcon className="h-4 w-4" />;
  if (type === "mobile") return <DevicePhoneMobileIcon className="h-4 w-4" />;
  return <DeviceTabletIcon className="h-4 w-4" />;
}

export interface AdColumnProps {
  onToggle: (ad: Ad) => void;
  togglingId?: string;
  rowMenu: (ad: Ad) => RowActionItem[];
}

export function adColumns(
  { onToggle, togglingId, rowMenu }: AdColumnProps,
  t: T,
) {
  const positions = positionLabels(t);
  const devices = deviceLabels(t);
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
          <span className="text-sm text-muted">—</span>
        ),
      { grow: 1, minWidth: 96, sortKey: "imageUrl", sortType: "text" },
    ),
    col.custom<Ad>(
      t("common.title"),
      (ad) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-heading">{ad.title}</p>
          {ad.iabCompliant ? (
            <span className="flex items-center gap-1 text-xs text-success-700">
              <CheckCircleIcon className="h-3 w-3" /> IAB: {ad.iabSize}
            </span>
          ) : ad.width && ad.height ? (
            <span className="flex items-center gap-1 text-xs text-warning-700">
              <ExclamationTriangleIcon className="h-3 w-3" /> Non-IAB
            </span>
          ) : null}
        </div>
      ),
      { grow: 3, minWidth: 180, sortKey: "title", sortType: "text" },
    ),
    col.muted<Ad>(
      t("admin.marketing.ads.size"),
      (ad) => (ad.width && ad.height ? `${ad.width}x${ad.height}` : null),
      {
        minWidth: 100,
        sortKey: "width",
        sortType: "number",
      },
    ),
    col.badge<Ad>(
      t("admin.marketing.ads.positionLabel"),
      (ad) => (
        <Badge variant="secondary" size="sm">
          {positions[ad.position] || ad.position}
        </Badge>
      ),
      { sortKey: "position", sortType: "text" },
    ),
    col.custom<Ad>(
      t("admin.marketing.ads.deviceLabel"),
      (ad) => (
        <span className="flex items-center gap-1 text-sm text-muted">
          <DeviceIcon type={ad.deviceType} />
          {devices[ad.deviceType] || ad.deviceType}
        </span>
      ),
      { sortKey: "deviceType", sortType: "text" },
    ),
    col.custom<Ad>(
      t("common.status"),
      (ad) => (
        <Button
          variant={ad.isActive ? "success" : "secondary"}
          size="sm"
          onClick={() => onToggle(ad)}
          disabled={togglingId === ad.id}
        >
          {ad.isActive ? t("common.active") : t("common.inactive")}
        </Button>
      ),
      { sortKey: "isActive", sortType: "number" },
    ),
    col.custom<Ad>(
      t("admin.marketing.ads.statistics"),
      (ad) => (
        <div className="text-sm">
          <div className="text-muted">
            {t("admin.marketing.ads.clickCount", { count: ad.clickCount })}
          </div>
          <div className="text-muted">
            {t("admin.marketing.ads.impressionCount", {
              count: ad.impressionCount,
            })}
          </div>
          <div className="text-primary-600">{ad.ctr}% CTR</div>
        </div>
      ),
      { grow: 1, minWidth: 120, sortKey: "clickCount", sortType: "number" },
    ),
    col.rowMenu<Ad>(rowMenu),
  ];
}
