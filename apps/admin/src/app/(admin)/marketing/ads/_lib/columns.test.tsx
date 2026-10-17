import type { ColumnDef } from "@tanstack/react-table";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { adColumns, adSizeLabel } from "./columns";
import { platformShortLabels } from "./types";
import type { Ad } from "./types";

// Ölçüm yapan (useLayoutEffect) gerçek bileşen yerine düz metin: SSR uyarısı olmasın.
vi.mock("@/components/table/TruncatedText", () => ({
  TruncatedText: (p: { children: React.ReactNode; className?: string }) => (
    <span className={p.className}>{p.children}</span>
  ),
}));

vi.mock("next/image", () => ({
  default: (p: { alt: string }) => <span data-img={p.alt} />,
}));

// Anahtarı (ve varsa `scope`u) döndüren sahte t — metin yerine anahtar doğrulanır.
const t = ((key: string, vals?: { scope?: string }) =>
  vals?.scope ? `${key}|${vals.scope}` : key) as never;

const ad: Ad = {
  id: "a1",
  title: "Yaz kampanyası",
  imageUrl: null,
  linkUrl: null,
  content: null,
  altText: null,
  width: 728,
  height: 90,
  position: "header",
  discountId: null,
  platform: "all",
  popupFrequency: "once" as Ad["popupFrequency"],
  popupVersion: 1,
  displayOrder: 0,
  isActive: true,
  startDate: null,
  endDate: null,
  clickCount: 3,
  impressionCount: 10,
  ctr: 30,
  iabCompliant: true,
  iabSize: "728x90",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const columns = adColumns(
  { onToggle: () => {}, rowMenu: () => [] },
  t,
) as ColumnDef<Ad, unknown>[];

function cell(id: string, row: Ad): string {
  const c = columns.find((x) => x.id === id);
  if (!c || typeof c.cell !== "function") throw new Error(`no column ${id}`);
  const node = (c.cell as (ctx: unknown) => ReactElement)({
    row: { original: row },
  });
  return renderToStaticMarkup(node);
}

describe("adSizeLabel", () => {
  it("prints width×height, nothing for a size-less (text) ad", () => {
    expect(adSizeLabel({ width: 728, height: 90 })).toBe("728×90");
    expect(adSizeLabel({ width: null, height: 90 })).toBeNull();
  });
});

describe("platformShortLabels", () => {
  it("uses the table-only short keys for every platform", () => {
    expect(platformShortLabels(t)).toEqual({
      web: "admin.marketing.ads.platformShort.web",
      app: "admin.marketing.ads.platformShort.app",
      all: "admin.marketing.ads.platformShort.all",
    });
  });
});

describe("adColumns", () => {
  it("size column: plain size text + outline IAB badge, no icon", () => {
    const out = cell("admin.marketing.ads.size", ad);
    expect(out).toContain("728×90");
    expect(out).toContain("IAB");
    expect(out).toContain("border-border");
    expect(out).not.toContain("<svg");
    expect(
      cell("admin.marketing.ads.size", { ...ad, iabCompliant: false }),
    ).not.toContain("IAB");
  });

  it("position and platform are plain text, not badges", () => {
    const pos = cell("admin.marketing.ads.positionLabel", ad);
    const plat = cell("admin.marketing.ads.platformLabel", ad);
    expect(plat).toContain("admin.marketing.ads.platformShort.all");
    for (const out of [pos, plat]) {
      expect(out).not.toContain("rounded-lg");
      expect(out).not.toContain("<svg");
    }
  });

  it("title cell has no IAB line under it", () => {
    const out = cell("common.title", ad);
    expect(out).toContain("Yaz kampanyası");
    expect(out).not.toContain("IAB");
  });

  it("live status is the only coloured badge, sm size", () => {
    const out = cell("admin.marketing.ads.liveStatusLabel", ad);
    expect(out).toContain("admin.marketing.ads.liveStatus.live");
    expect(out).toContain("bg-success-100");
    expect(out).toContain("text-xs");
  });

  it("shadowed: short badge label, full sentence in the tooltip", () => {
    const out = cell("admin.marketing.ads.liveStatusLabel", {
      ...ad,
      platform: "web",
      shadowedOn: ["web"],
    });
    expect(out).toContain("admin.marketing.ads.liveStatusShort.shadowed");
    expect(out).toContain(
      'title="admin.marketing.ads.liveStatus.shadowed|all"',
    );
    expect(out).toContain("bg-warning-100");
  });

  it("status column is a switch reflecting isActive", () => {
    expect(cell("common.status", ad)).toContain('aria-checked="true"');
    expect(cell("common.status", { ...ad, isActive: false })).toContain(
      'aria-checked="false"',
    );
  });

  it("every column carries an explicit width", () => {
    for (const c of columns) expect(c.meta?.minWidth).toBeGreaterThan(0);
  });
});
