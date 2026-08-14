import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { breadcrumbsFor, humanizeSegment, routePermission } from "./navigation";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

describe("routePermission", () => {
  it("returns the permission for a registered top-level route", () => {
    expect(routePermission("/accounts/users")).toBe("users");
    expect(routePermission("/operations/orders")).toBe("orders");
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
