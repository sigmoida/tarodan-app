import { describe, expect, it } from "vitest";
import { ADMIN_ORDER_TAB_BUCKETS, ADMIN_ORDER_TABS } from "@tarodan/types";
import { defaultOrderBucket } from "./defaultBucket";

const params = (query: string) => new URLSearchParams(query);

describe("defaultOrderBucket", () => {
  it("opens the work queue (Yeni) without a deep-link scope", () => {
    expect(defaultOrderBucket(params(""))).toBe("new");
    expect(defaultOrderBucket(params("tab=offer&party=ali"))).toBe("new");
  });

  it("opens every order (Tümü) for a user or product deep link", () => {
    expect(defaultOrderBucket(params("userId=u1"))).toBe("all");
    expect(defaultOrderBucket(params("userId=u1&userRole=seller"))).toBe("all");
    expect(defaultOrderBucket(params("productId=p1"))).toBe("all");
  });

  it("ignores an empty scope parameter", () => {
    expect(defaultOrderBucket(params("userId=&productId="))).toBe("new");
  });

  it("both defaults exist on every tab, with Tümü first", () => {
    for (const tab of ADMIN_ORDER_TABS) {
      expect(ADMIN_ORDER_TAB_BUCKETS[tab][0]).toBe("all");
      expect(ADMIN_ORDER_TAB_BUCKETS[tab]).toContain("new");
    }
  });
});
