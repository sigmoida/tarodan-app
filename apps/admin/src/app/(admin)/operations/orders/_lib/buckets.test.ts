import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_BUCKET_I18N_KEYS,
  ADMIN_ORDER_TAB_BUCKETS,
  ADMIN_ORDER_TABS,
  resolveAdminOrderBucket,
} from "@tarodan/types";
import { messages } from "@tarodan/i18n";

const lookup = (tree: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      tree,
    );

describe("order bucket bar", () => {
  it("has a label in both locales for every bucket of every tab", () => {
    for (const tab of ADMIN_ORDER_TABS) {
      for (const bucket of ADMIN_ORDER_TAB_BUCKETS[tab]) {
        const key = ADMIN_ORDER_BUCKET_I18N_KEYS[bucket];
        expect(typeof lookup(messages.tr, key), `${key} (tr)`).toBe("string");
        expect(typeof lookup(messages.en, key), `${key} (en)`).toBe("string");
      }
    }
  });

  it("opens the cancelled and refunds buckets from a deep link", () => {
    expect(resolveAdminOrderBucket("all", "cancelled")).toBe("cancelled");
    expect(resolveAdminOrderBucket("all", "refunds")).toBe("refunds");
  });

  it("falls back for an unknown bucket", () => {
    expect(resolveAdminOrderBucket("all", "nope", "new")).toBe("new");
  });
});
