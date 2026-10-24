import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import { PAYOUT_FAILURE_REASONS } from "@tarodan/types";
import { payoutFailureReasonConfig } from "@tarodan/ui";
import type { Translate } from "@/lib/statusLabels";
import { failureReasonText } from "./failureReason";

const tr = getMessages("tr");
const en = getMessages("en");

const at = (catalog: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalog,
    );

const t = createTranslator({
  locale: "tr",
  messages: tr,
}) as unknown as Translate;

describe("payout failure reason labels", () => {
  it.each(PAYOUT_FAILURE_REASONS)("%s has a label in tr and en", (code) => {
    const entry = payoutFailureReasonConfig[code];
    expect(entry).toBeDefined();
    for (const catalog of [tr, en]) {
      const text = at(catalog, entry.labelKey);
      expect(typeof text).toBe("string");
      expect((text as string).trim()).not.toBe("");
    }
    expect(failureReasonText(code, t)).toBe(at(tr, entry.labelKey));
    expect(failureReasonText(code, t)).not.toBe(code);
  });

  it("labels only the shared codes (no stale entries)", () => {
    expect(Object.keys(payoutFailureReasonConfig).sort()).toEqual(
      [...PAYOUT_FAILURE_REASONS].sort(),
    );
  });

  it("shows free text as is: legacy rows and returned rows", () => {
    expect(failureReasonText("Bad Request Exception", t)).toBe(
      "Bad Request Exception",
    );
    expect(
      failureReasonText("Geri döndü (PayTR ref R1, tespit 2026-10-20)", t),
    ).toBe("Geri döndü (PayTR ref R1, tespit 2026-10-20)");
  });

  it("has no text without a reason", () => {
    expect(failureReasonText(null, t)).toBeNull();
    expect(failureReasonText(undefined, t)).toBeNull();
    expect(failureReasonText("   ", t)).toBeNull();
  });
});
