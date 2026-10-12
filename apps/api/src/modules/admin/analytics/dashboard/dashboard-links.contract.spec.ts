import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_FINANCE_LIST_HREFS,
  ADMIN_ORDERS_PATH,
  DASHBOARD_ALERT_LINKS,
  DASHBOARD_QUEUE_LINKS,
  DASHBOARD_QUEUE_PART_LINKS,
  adminOrdersShippedBeforeHref,
  isAdminOrdersScreenTab,
} from "@tarodan/types";
import { repoRoot } from "../../../../common/helpers/app-root";

/**
 * Dashboard bağlantıları gerçek bir panel ekranına ve VAR OLAN bir sekmeye
 * gider (contract). Panelin kendi Jest'i yok; rotalar diskten okunur — bir
 * sayfa taşınır ya da bir sekme silinirse bağlantı sessizce boş sayfaya
 * düşmesin. Satırın listeyle birebir mi eşleştiği `docs/DASHBOARD_LINKS.md`'de.
 */
const ADMIN_APP = join(repoRoot(), "apps/admin/src/app/(admin)");

/** Sayfa klasöründeki bütün kaynak (sekme anahtarları `_lib`'de de durabilir). */
function sourcesUnder(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((path) => {
      if (statSync(path).isDirectory()) {
        // Alt rotalar ([id], edit…) bu sayfanın sekmesini tanımlamaz.
        return /[/\\](_[^/\\]+)$/.test(path) ? sourcesUnder(path) : "";
      }
      return /\.tsx?$/.test(path) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

const ALL_LINKS: Array<[string, string]> = [
  ...Object.entries(DASHBOARD_QUEUE_PART_LINKS).map(
    ([key, href]) => [`queue part ${key}`, href] as [string, string],
  ),
  ...Object.entries(DASHBOARD_QUEUE_LINKS).map(
    ([key, href]) => [`queue tile ${key}`, href] as [string, string],
  ),
  ...Object.entries(DASHBOARD_ALERT_LINKS).map(
    ([key, href]) => [`alert ${key}`, href] as [string, string],
  ),
  ...Object.entries(ADMIN_FINANCE_LIST_HREFS).map(
    ([key, href]) => [`finance list ${key}`, href] as [string, string],
  ),
  [
    "alert stuckShippedOrders (threshold-bound)",
    adminOrdersShippedBeforeHref("2026-10-02T09:00:00.000Z"),
  ],
];

describe("dashboard links land on an existing admin page and tab (contract)", () => {
  it.each(ALL_LINKS)("%s → %s", (_name, href) => {
    const url = new URL(href, "https://admin.test");
    const pageDir = join(ADMIN_APP, url.pathname);
    expect(existsSync(join(pageDir, "page.tsx"))).toBe(true);

    const tab = url.searchParams.get("tab");
    if (!tab) return;
    if (url.pathname === ADMIN_ORDERS_PATH) {
      // Siparişler ekranının sekmeleri `@tarodan/types`'ta tanımlı.
      expect(isAdminOrdersScreenTab(tab)).toBe(true);
      return;
    }
    expect(sourcesUnder(pageDir)).toContain(`"${tab}"`);
  });

  it("no link points at the logs screen's non-existent outbox tab", () => {
    for (const [, href] of ALL_LINKS) {
      const url = new URL(href, "https://admin.test");
      if (url.pathname === "/system/logs") {
        expect(url.searchParams.get("tab")).toBeNull();
      }
    }
  });
});
