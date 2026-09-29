import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  breadcrumbsFor,
  canAccessRoute,
  getNavGroups,
  humanizeSegment,
  pageMetadataFor,
  routePermission,
  satisfiesPermission,
} from "./navigation";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

const holder =
  (...keys: string[]) =>
  (key: string) =>
    keys.includes(key);

describe("routePermission", () => {
  it("returns the permission for a registered top-level route", () => {
    expect(routePermission("/accounts/users")).toBe("users");
  });

  it("opens the orders screen with orders OR trades (tabs are hidden per permission)", () => {
    expect(routePermission("/operations/orders")).toEqual(["orders", "trades"]);
  });

  it("keeps the order file under the screen on the orders permission", () => {
    expect(routePermission("/operations/orders/o1")).toBe("orders");
  });

  it("guards the moved offer and trade files with their tabs' permissions", () => {
    expect(routePermission("/operations/offers/of1")).toBe("orders");
    expect(routePermission("/operations/trades/tr1")).toBe("trades");
    // Eski liste adresleri yönlenmeden önce de aynı izinle korunur.
    expect(routePermission("/operations/offers")).toBe("orders");
    expect(routePermission("/operations/trades")).toBe("trades");
  });

  it("guards the cancellations & refunds screen and the refund-request file with the refund permission", () => {
    expect(routePermission("/operations/cancellations-refunds")).toBe(
      "refund_requests",
    );
    // Liste menüden çıktı, dosya yerinde: aynı izinle korunur.
    expect(routePermission("/operations/refund-requests/rr-1")).toBe(
      "refund_requests",
    );
    // Eski liste adresi yönlenmeden önce de korunur.
    expect(routePermission("/operations/refund-requests")).toBe(
      "refund_requests",
    );
  });

  it("matches a sub-path of a registered route (prefix match)", () => {
    expect(routePermission("/accounts/users/some-user-id")).toBe("users");
  });

  it("deliberately excludes /dashboard (always accessible, avoids a redirect loop)", () => {
    expect(routePermission("/dashboard")).toBeNull();
  });

  it("returns null for an unregistered route", () => {
    expect(routePermission("/this/route/does/not/exist")).toBeNull();
  });

  it("does not match a route that merely shares a prefix without a / boundary", () => {
    // "/accounts/users" is registered; "/accounts/users-export" is a
    // different, unregistered route and must not match by raw prefix.
    expect(routePermission("/accounts/users-export")).toBeNull();
  });
});

describe("canAccessRoute (orders / trades split)", () => {
  it("a trades-only user reaches the screen (Takaslar tab) and trade files", () => {
    const trades = holder("trades");
    expect(canAccessRoute("/operations/orders", trades)).toBe(true);
    expect(canAccessRoute("/operations/trades/tr1", trades)).toBe(true);
    expect(canAccessRoute("/operations/trades", trades)).toBe(true);
  });

  it("a trades-only user cannot open order or offer files", () => {
    const trades = holder("trades");
    expect(canAccessRoute("/operations/orders/o1", trades)).toBe(false);
    expect(canAccessRoute("/operations/offers/of1", trades)).toBe(false);
  });

  it("an orders-only user reaches orders and offers but not trade files", () => {
    const orders = holder("orders");
    expect(canAccessRoute("/operations/orders", orders)).toBe(true);
    expect(canAccessRoute("/operations/orders/o1", orders)).toBe(true);
    expect(canAccessRoute("/operations/offers/of1", orders)).toBe(true);
    expect(canAccessRoute("/operations/trades/tr1", orders)).toBe(false);
  });

  it("unguarded routes are open, a user without either key is kept out", () => {
    expect(canAccessRoute("/dashboard", holder())).toBe(true);
    expect(canAccessRoute("/operations/orders", holder("users"))).toBe(false);
  });

  it("a permission list is any-of", () => {
    expect(satisfiesPermission(["a", "b"], holder("b"))).toBe(true);
    expect(satisfiesPermission(["a", "b"], holder("c"))).toBe(false);
    expect(satisfiesPermission("a", holder("a"))).toBe(true);
  });
});

describe("the operations menu", () => {
  it("has one Siparişler item and no separate Teklifler / Takaslar items", () => {
    const hrefs = getNavGroups(t)
      .find((group) => group.id === "operations")
      ?.items.map((item) => item.href);
    expect(hrefs).toContain("/operations/orders");
    expect(hrefs).not.toContain("/operations/offers");
    expect(hrefs).not.toContain("/operations/trades");
  });

  it("titles the moved detail pages under Siparişler", () => {
    expect(pageMetadataFor("/operations/trades/tr1", t).title).toBe(
      pageMetadataFor("/operations/orders/o1", t).title,
    );
    expect(pageMetadataFor("/operations/offers/of1", t).title).toBe(
      pageMetadataFor("/operations/orders/o1", t).title,
    );
  });
});

describe("humanizeSegment", () => {
  it("collapses a purely numeric id segment to the detail suffix", () => {
    expect(humanizeSegment("12345", t)).toBe(t("admin.nav.detailSuffix"));
  });

  it("collapses a UUID-shaped segment to the detail suffix", () => {
    expect(humanizeSegment("a1b2c3d4-e5f6-4789-a123-000000000000", t)).toBe(
      t("admin.nav.detailSuffix"),
    );
  });

  it("title-cases a kebab-case segment", () => {
    expect(humanizeSegment("guest-contact", t)).toBe("Guest Contact");
  });

  it("uses Turkish-locale uppercasing, not plain ASCII toUpperCase", () => {
    // Plain toUpperCase() turns "i" into "I" (dotless); Turkish locale turns
    // it into "İ" (dotted) — this is exactly why the source uses
    // toLocaleUpperCase("tr-TR") instead of toUpperCase().
    expect(humanizeSegment("istanbul-magazasi", t)).toBe("İstanbul Magazasi");
  });
});

describe("breadcrumbsFor", () => {
  it("places the refund-request file under the cancellations & refunds page", () => {
    const crumbs = breadcrumbsFor(
      "/operations/refund-requests/3f2a9c1e-0000-4000-8000-000000000000",
      t,
    );
    expect(crumbs.at(-2)?.href).toBe("/operations/cancellations-refunds");
    expect(crumbs.at(-1)).toEqual({ label: "admin.nav.detailSuffix" });
  });

  it("places the trade and offer files under Siparişler, the crumb opening their tab", () => {
    const trade = breadcrumbsFor(
      "/operations/trades/3f2a9c1e-0000-4000-8000-000000000000",
      t,
    );
    expect(trade.at(-2)).toEqual({
      label: "admin.nav.items.orders.name",
      href: "/operations/orders?tab=trades",
    });
    expect(trade.at(-1)).toEqual({ label: "admin.nav.detailSuffix" });

    const offer = breadcrumbsFor(
      "/operations/offers/3f2a9c1e-0000-4000-8000-000000000000",
      t,
    );
    expect(offer.at(-2)).toEqual({
      label: "admin.nav.items.orders.name",
      href: "/operations/orders?tab=offers",
    });
  });

  it("the order file's crumb opens the orders screen itself", () => {
    const crumbs = breadcrumbsFor("/operations/orders/o-1", t);
    expect(crumbs.at(-2)?.href).toBe("/operations/orders");
  });

  it("returns [] for a path matching no nav item", () => {
    expect(breadcrumbsFor("/this/route/does/not/exist", t)).toEqual([]);
  });

  it("builds group -> page for a leaf page in a group", () => {
    const crumbs = breadcrumbsFor("/accounts/users", t);
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0].href).toBeDefined(); // group crumb links to its first page
    expect(crumbs[1].href).toBeUndefined(); // current page, not a link
  });

  it("builds group -> page -> detail for a numeric-id sub-path", () => {
    const crumbs = breadcrumbsFor("/accounts/users/12345", t);
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1].href).toBeDefined(); // page crumb is now a link
    expect(crumbs[2]).toEqual({ label: t("admin.nav.detailSuffix") });
  });

  it("builds a single, non-linked crumb for a top-level page with no group", () => {
    const crumbs = breadcrumbsFor("/dashboard", t);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].href).toBeUndefined();
  });

  it("humanizes a non-id tail segment instead of collapsing it", () => {
    const crumbs = breadcrumbsFor("/accounts/users/guest-contact", t);
    expect(crumbs[crumbs.length - 1]).toEqual({ label: "Guest Contact" });
  });
});
