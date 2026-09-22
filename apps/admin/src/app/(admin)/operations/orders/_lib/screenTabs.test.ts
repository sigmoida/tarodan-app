import { describe, expect, it } from "vitest";
import {
  ADMIN_OFFERS_TAB_HREF,
  ADMIN_ORDERS_PATH,
  ADMIN_ORDERS_SCREEN_PERMISSIONS,
  ADMIN_ORDERS_SCREEN_TABS,
  ADMIN_ORDER_TABS,
  ADMIN_ORDER_TAB_BUCKETS,
  ADMIN_TRADES_TAB_HREF,
  DASHBOARD_ALERT_LINKS,
  DASHBOARD_QUEUE_LINKS,
  DASHBOARD_QUEUE_PARTS,
  DASHBOARD_QUEUE_PART_LINKS,
  adminOrdersTabHref,
  allowedAdminOrdersScreenTabs,
  isAdminOrderListTab,
  resolveAdminOrdersScreenTab,
} from "@tarodan/types";
import { fieldKeys } from "@/components/list/filters/schema";
import { orderFilterFields } from "./filters";
import { offerFilterFields } from "./offers/filters";
import { tradeFilterFields } from "./trades/filters";
import {
  ORDERS_SCOPE_PARAMS,
  ORDERS_TAB_SCOPED_PARAMS,
  TRADES_SCOPE_PARAMS,
  ordersTabHref,
  scopeParamsOf,
} from "./screenTabs";

const t = ((key: string) => key) as unknown as Parameters<
  typeof orderFilterFields
>[0];

describe("the orders screen tab set", () => {
  it("is five tabs in screen order; the order tabs are a subset", () => {
    expect(ADMIN_ORDERS_SCREEN_TABS).toEqual([
      "all",
      "direct_sale",
      "offers",
      "offer_order",
      "trades",
    ]);
    expect(ADMIN_ORDERS_SCREEN_TABS.filter(isAdminOrderListTab)).toEqual([
      ...ADMIN_ORDER_TABS,
    ]);
    expect(isAdminOrderListTab("offers")).toBe(false);
    expect(isAdminOrderListTab("trades")).toBe(false);
  });

  it("offer orders use the order buckets; the offer-only buckets are gone", () => {
    expect(ADMIN_ORDER_TAB_BUCKETS.offer_order).toEqual([
      "all",
      "new",
      "shipped",
      "in_transit",
      "delivered",
      "other",
    ]);
    for (const tab of ADMIN_ORDER_TABS) {
      expect(ADMIN_ORDER_TAB_BUCKETS[tab]).not.toContain("pending");
      expect(ADMIN_ORDER_TAB_BUCKETS[tab]).not.toContain("expired");
    }
  });
});

describe("resolveAdminOrdersScreenTab", () => {
  it("defaults to all orders and keeps a known tab", () => {
    expect(resolveAdminOrdersScreenTab(undefined)).toBe("all");
    expect(resolveAdminOrdersScreenTab("nope")).toBe("all");
    expect(resolveAdminOrdersScreenTab("trades")).toBe("trades");
    expect(resolveAdminOrdersScreenTab("offer_order")).toBe("offer_order");
  });

  it("maps the old mixed Teklifler tab (tab=offer) to the offers tab", () => {
    expect(resolveAdminOrdersScreenTab("offer")).toBe("offers");
  });

  it("falls back to the first permitted tab when the requested one is hidden", () => {
    expect(resolveAdminOrdersScreenTab(undefined, ["trades"])).toBe("trades");
    expect(resolveAdminOrdersScreenTab("offers", ["trades"])).toBe("trades");
    expect(resolveAdminOrdersScreenTab("trades", ["all", "direct_sale"])).toBe(
      "all",
    );
  });
});

describe("allowedAdminOrdersScreenTabs (tabs hidden per permission)", () => {
  const holder =
    (...keys: string[]) =>
    (key: string) =>
      keys.includes(key);

  it("orders permission sees the order and offer tabs, not trades", () => {
    expect(allowedAdminOrdersScreenTabs(holder("orders"))).toEqual([
      "all",
      "direct_sale",
      "offers",
      "offer_order",
    ]);
  });

  it("trades permission alone sees only Takaslar", () => {
    expect(allowedAdminOrdersScreenTabs(holder("trades"))).toEqual(["trades"]);
  });

  it("both permissions see every tab; the screen opens with either", () => {
    expect(allowedAdminOrdersScreenTabs(holder("orders", "trades"))).toEqual([
      ...ADMIN_ORDERS_SCREEN_TABS,
    ]);
    expect([...ADMIN_ORDERS_SCREEN_PERMISSIONS].sort()).toEqual([
      "orders",
      "trades",
    ]);
  });
});

describe("ordersTabHref (old list routes → tabs, query preserved)", () => {
  it("opens a tab without a query exactly like the shared href", () => {
    expect(ordersTabHref("offers")).toBe(ADMIN_OFFERS_TAB_HREF);
    expect(ordersTabHref("trades")).toBe(ADMIN_TRADES_TAB_HREF);
    expect(ADMIN_TRADES_TAB_HREF).toBe("/operations/orders?tab=trades");
    expect(ADMIN_OFFERS_TAB_HREF).toBe("/operations/orders?tab=offers");
    for (const tab of ADMIN_ORDERS_SCREEN_TABS) {
      expect(ordersTabHref(tab)).toBe(adminOrdersTabHref(tab));
    }
  });

  it("the default tab writes no tab parameter", () => {
    expect(ordersTabHref("all")).toBe(ADMIN_ORDERS_PATH);
    expect(ordersTabHref("all", { userId: "u1" })).toBe(
      "/operations/orders?userId=u1",
    );
  });

  it("keeps the old link's filters and deep-link scope", () => {
    expect(
      ordersTabHref("trades", {
        userId: "u1",
        status: "disputed",
        fromDate: "2026-09-01",
      }),
    ).toBe(
      "/operations/orders?tab=trades&userId=u1&status=disputed&fromDate=2026-09-01",
    );
    expect(ordersTabHref("offers", { productId: "p1", q: "ali" })).toBe(
      "/operations/orders?tab=offers&productId=p1&q=ali",
    );
  });

  it("repeats multi-value params and drops a conflicting tab", () => {
    expect(
      ordersTabHref(
        "offers",
        new URLSearchParams("tab=all&status=pending&status=accepted"),
      ),
    ).toBe("/operations/orders?tab=offers&status=pending&status=accepted");
  });
});

describe("tab switch param clearing", () => {
  it("clears every filter any tab owns, plus the list's own params", () => {
    const owned = [
      ...orderFilterFields(t).flatMap(fieldKeys),
      ...offerFilterFields(t).flatMap(fieldKeys),
      ...tradeFilterFields(t).flatMap(fieldKeys),
      "bucket",
      "page",
      "q",
      "sort",
      "dir",
      "sortType",
      "size",
      // the orders list's legacy deep-link status
      "status",
    ];
    for (const key of owned) {
      expect(ORDERS_TAB_SCOPED_PARAMS).toContain(key);
    }
  });

  it("keeps the user / product deep-link scope across tabs", () => {
    for (const key of ORDERS_SCOPE_PARAMS) {
      expect(ORDERS_TAB_SCOPED_PARAMS).not.toContain(key);
    }
    expect(ORDERS_TAB_SCOPED_PARAMS).not.toContain("tab");
  });

  it("an inactive tab's badge counts only the scope that tab reads", () => {
    const params = new URLSearchParams(
      "tab=offers&userId=u1&userRole=seller&productId=p1&status=pending",
    );
    expect(scopeParamsOf(params)).toEqual({
      userId: "u1",
      userRole: "seller",
      productId: "p1",
    });
    expect(scopeParamsOf(params, TRADES_SCOPE_PARAMS)).toEqual({
      userId: "u1",
    });
    expect(scopeParamsOf(new URLSearchParams("userId="))).toEqual({});
  });
});

describe("dashboard deep links", () => {
  it("trade queue lines and alerts open the Takaslar tab, not the old list", () => {
    for (const key of DASHBOARD_QUEUE_PARTS.tradeOperations) {
      expect(DASHBOARD_QUEUE_PART_LINKS[key]).toBe(ADMIN_TRADES_TAB_HREF);
    }
    expect(DASHBOARD_QUEUE_LINKS.tradeOperations).toBe(ADMIN_TRADES_TAB_HREF);
    expect(DASHBOARD_ALERT_LINKS.stuckWarehouseTrades).toBe(
      ADMIN_TRADES_TAB_HREF,
    );
    expect(DASHBOARD_ALERT_LINKS.stuckOutboundTrades).toBe(
      ADMIN_TRADES_TAB_HREF,
    );
  });

  it("no dashboard link points at a removed list route", () => {
    const links = [
      ...Object.values(DASHBOARD_QUEUE_PART_LINKS),
      ...Object.values(DASHBOARD_QUEUE_LINKS),
      ...Object.values(DASHBOARD_ALERT_LINKS),
    ];
    for (const href of links) {
      const path = href.split("?")[0];
      expect(path).not.toBe("/operations/trades");
      expect(path).not.toBe("/operations/offers");
    }
  });
});
