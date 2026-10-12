"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AD_HOTSPOT_LABEL_MAX, AD_HOTSPOT_MAX } from "@tarodan/types";
import { Alert, Button, Input, cn } from "@tarodan/ui";
import { Panel } from "@/components/detail/Panel";
import { fmtNumber } from "@/lib/format";
import type { AdHotspotFormRow, HotspotIssue } from "../_lib/types";
import type { ResizeHandle } from "../_lib/hotspotGeometry";
import { useHotspotDrag } from "./useHotspotDrag";

const HANDLES: { handle: ResizeHandle; className: string }[] = [
  { handle: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { handle: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { handle: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
];

const pct = (n: number) => `${n * 100}%`;

interface Props {
  imageUrl: string;
  value: AdHotspotFormRow[];
  onChange: (next: AdHotspotFormRow[]) => void;
  /** Satır içi gösterilecek hatalar (form gönderilene kadar boş geçilir). */
  issues: HotspotIssue[];
}

/**
 * Görsel üzerine tıklanabilir alan çizme/taşıma/boyutlandırma + alt alta ad ve
 * bağlantı satırları. Görsel yokken pasif (alan görselin kesri olduğundan
 * önce görsel gerekir).
 */
export function HotspotEditor({ imageUrl, value, onChange, issues }: Props) {
  const t = useTranslations();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const { preview, beginMove, beginResize, surfaceHandlers } = useHotspotDrag({
    value,
    max: AD_HOTSPOT_MAX,
    surfaceRef,
    onChange,
    onSelect: setSelected,
  });

  if (!imageUrl) {
    return (
      <Alert variant="info">{t("admin.marketing.ads.hotspots.disabled")}</Alert>
    );
  }

  const full = value.length >= AD_HOTSPOT_MAX;
  const issuesAt = (index: number, field: string) =>
    issues.find((i) => i.path[1] === index && i.path[2] === field)?.message;
  const listIssue = issues.find((i) => i.path.length === 1)?.message;

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setSelected(null);
  };

  const patch = (index: number, change: Partial<AdHotspotFormRow>) =>
    onChange(value.map((h, i) => (i === index ? { ...h, ...change } : h)));

  const onKeyDown = (e: KeyboardEvent) => {
    if (selected !== null && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      remove(selected);
    }
  };

  // Sürüklenen alan için son geçerli dikdörtgen gösterilir.
  const rectOf = (h: AdHotspotFormRow, index: number) =>
    preview?.index === index ? preview.rect : h;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {t("admin.marketing.ads.hotspots.title")}
        </span>
        <span className="text-sm font-medium text-heading">
          {t("admin.marketing.ads.hotspots.count", {
            count: value.length,
            max: AD_HOTSPOT_MAX,
          })}
        </span>
      </div>
      <p className="text-xs text-muted">
        {t("admin.marketing.ads.hotspots.help")}{" "}
        {t("admin.marketing.ads.hotspots.mobileNote")}
      </p>
      {full && (
        <Alert variant="info">{t("admin.marketing.ads.hotspots.maxReached")}</Alert>
      )}
      {value.length === 0 && (
        <Alert variant="warning">
          {t("admin.marketing.ads.hotspots.emptyWarning")}
        </Alert>
      )}
      {listIssue && <Alert variant="danger">{listIssue}</Alert>}

      <div
        ref={surfaceRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...surfaceHandlers}
        className={cn(
          "relative mx-auto w-full max-w-xl touch-none select-none overflow-hidden rounded-lg border border-border bg-surface-alt focus:outline-none focus:ring-1 focus:ring-primary-500",
          full ? "cursor-default" : "cursor-crosshair",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={t("admin.marketing.ads.preview")}
          draggable={false}
          className="block h-auto w-full"
        />
        {value.map((h, index) => {
          const r = rectOf(h, index);
          const isSelected = selected === index;
          return (
            <div
              key={h.id ?? index}
              role="button"
              aria-pressed={isSelected}
              aria-label={t("admin.marketing.ads.hotspots.areaLabel", {
                index: index + 1,
                label: h.label,
              })}
              onPointerDown={(e) => beginMove(e, index)}
              className={cn(
                "absolute cursor-move border-2 border-primary-600",
                isSelected
                  ? "z-10 bg-primary-500/40 ring-2 ring-primary-300"
                  : "bg-primary-500/20",
              )}
              style={{
                left: pct(r.x),
                top: pct(r.y),
                width: pct(r.width),
                height: pct(r.height),
              }}
            >
              <span className="absolute left-0 top-0 rounded-br bg-primary-600 px-1 text-xs font-semibold text-inverted">
                {index + 1}
              </span>
              {isSelected &&
                HANDLES.map(({ handle, className }) => (
                  <div
                    key={handle}
                    onPointerDown={(e) => beginResize(e, index, handle)}
                    className={cn(
                      "absolute h-3 w-3 border border-primary-600 bg-surface",
                      className,
                    )}
                  />
                ))}
            </div>
          );
        })}
        {preview?.index === null && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-primary-600 bg-primary-500/20"
            style={{
              left: pct(preview.rect.x),
              top: pct(preview.rect.y),
              width: pct(preview.rect.width),
              height: pct(preview.rect.height),
            }}
          />
        )}
      </div>

      <div className="space-y-2">
        {value.map((h, index) => (
          <Panel
            key={h.id ?? index}
            padding="sm"
            tone={selected === index ? "muted" : "default"}
            className="space-y-2"
            onClick={() => setSelected(index)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-heading">
                {t("admin.marketing.ads.hotspots.rowName", { index: index + 1 })}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {t("admin.marketing.ads.hotspots.clicks")}:{" "}
                  {fmtNumber(h.clickCount) ?? "—"}
                </span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(index);
                  }}
                >
                  {t("admin.marketing.ads.hotspots.delete")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                label={t("admin.marketing.ads.hotspots.label")}
                value={h.label}
                maxLength={AD_HOTSPOT_LABEL_MAX}
                placeholder={t("admin.marketing.ads.hotspots.labelPlaceholder")}
                error={issuesAt(index, "label")}
                onChange={(e) => patch(index, { label: e.target.value })}
              />
              <Input
                label={t("admin.marketing.ads.hotspots.link")}
                value={h.linkUrl}
                placeholder={t("admin.marketing.ads.linkUrlPlaceholder")}
                error={issuesAt(index, "linkUrl")}
                onChange={(e) => patch(index, { linkUrl: e.target.value })}
              />
            </div>
            {issuesAt(index, "x") && (
              <p className="text-xs text-danger-500">{issuesAt(index, "x")}</p>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
