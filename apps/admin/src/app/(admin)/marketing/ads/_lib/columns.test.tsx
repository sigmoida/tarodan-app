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
  it("size column: plain size text + outline IAB / non-IAB badge, no icon", () => {
    const ok = cell("admin.marketing.ads.size", ad);
    expect(ok).toContain("728×90");
    expect(ok).toContain("admin.marketing.ads.iabBadge");
    expect(ok).toContain('title="728x90"');
    expect(ok).toContain("border-border");
    expect(ok).not.toContain("<svg");
    const non = cell("admin.marketing.ads.size", {
      ...ad,
      iabCompliant: false,
    });
    expect(non).toContain("admin.marketing.ads.nonIabBadge");
    expect(non).toContain("border-border");
    expect(non).not.toContain("admin.marketing.ads.iabBadge");
    // Boyutsuz (metin) reklamda IAB rozeti yok.
    expect(
      cell("admin.marketing.ads.size", { ...ad, width: null, height: null }),
    ).not.toContain("Badge");
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

  it("shadowed: short badge label with where it's hidden, full sentence in the tooltip", () => {
    const everywhere = cell("admin.marketing.ads.liveStatusLabel", {
      ...ad,
      platform: "web",
      shadowedOn: ["web"],
    });
    expect(everywhere).toContain(
      "admin.marketing.ads.liveStatusShort.shadowed|all",
    );
    expect(everywhere).toContain(
      'title="admin.marketing.ads.liveStatus.shadowed|all"',
    );
    expect(everywhere).toContain("bg-warning-100");
    const appOnly = cell("admin.marketing.ads.liveStatusLabel", {
      ...ad,
      platform: "all",
      shadowedOn: ["app"],
    });
    expect(appOnly).toContain(
      "admin.marketing.ads.liveStatusShort.shadowed|app",
    );
  });

  it("status column: switch with a row-specific name + visible state text", () => {
    const on = cell("common.status", ad);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="common.status: Yaz kampanyası"');
    expect(on).toContain("common.active");
    const off = cell("common.status", { ...ad, isActive: false });
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain("common.inactive");
  });

  it("every column carries an explicit width", () => {
    for (const c of columns) expect(c.meta?.minWidth).toBeGreaterThan(0);
  });
});
