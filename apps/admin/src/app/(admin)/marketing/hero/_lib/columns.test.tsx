import type { ColumnDef } from "@tanstack/react-table";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { heroColumns } from "./columns";
import type { HeroSlide } from "./types";

// Ölçüm yapan (useLayoutEffect) gerçek bileşen yerine düz metin: SSR uyarısı olmasın.
vi.mock("@/components/table/TruncatedText", () => ({
  TruncatedText: (p: { children: React.ReactNode; className?: string }) => (
    <span className={p.className}>{p.children}</span>
  ),
}));

const t = ((key: string) => key) as never;

const slide = {
  id: "h1",
  title: { tr: "Yaz", en: "Summer" },
  subtitle: { tr: "Alt", en: "Sub" },
  imageUrl: "/x.jpg",
  imageAlt: null,
  platform: "all",
  isActive: true,
  isLive: true,
  startDate: null,
  endDate: null,
  hideOnIos: false,
  cta1Label: null,
  cta1Href: null,
  cta2Label: null,
  cta2Href: null,
  impressionCount: 1,
  clickCount: 0,
  cta1ClickCount: 0,
  cta2ClickCount: 0,
} as unknown as HeroSlide;

function render(
  id: string,
  row: HeroSlide,
  homeVisibility?: { web: boolean; app: boolean },
): string {
  const columns = heroColumns(
    {
      onToggle: () => {},
      rowMenu: () => [],
      homeVisibility: homeVisibility as never,
    },
    t,
  ) as ColumnDef<HeroSlide, unknown>[];
  const c = columns.find((x) => x.id === id);
  if (!c || typeof c.cell !== "function") throw new Error(`no column ${id}`);
  return renderToStaticMarkup(
    (c.cell as (ctx: unknown) => ReactElement)({ row: { original: row } }),
  );
}

describe("heroColumns", () => {
  it("platform is plain text with the shared short table label", () => {
    const out = render("admin.marketing.hero.columns.platform", slide);
    expect(out).toContain("admin.marketing.ads.platformShort.all");
    expect(out).not.toContain("rounded-lg");
  });

  it("live status renders through the sm TableBadge", () => {
    const out = render("admin.marketing.ads.liveStatusLabel", slide);
    expect(out).toContain("admin.marketing.ads.liveStatus.live");
    expect(out).toContain("bg-success-100");
    expect(out).toContain("text-xs");
  });

  it("keeps the 'live · web hidden' warning status", () => {
    const out = render("admin.marketing.ads.liveStatusLabel", slide, {
      web: false,
      app: true,
    });
    expect(out).toContain("admin.marketing.hero.liveHidden.web");
    expect(out).toContain("bg-warning-100");
  });

  it("status is a switch with a row-specific name + visible state", () => {
    const out = render("common.status", slide);
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-label="common.status: Yaz"');
    expect(out).toContain("common.active");
  });
});
