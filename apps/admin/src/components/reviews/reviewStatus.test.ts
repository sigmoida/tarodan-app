import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import {
  RATING_STATUSES,
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { reviewStatusConfig, reviewStatusLabel } from "./reviewStatus";
import { reviewModerationError } from "./errors";

/**
 * The review status badge and the moderation errors, rendered with the real
 * catalogs in both languages: every stored status has a label (a missing key
 * would show the raw key in the list), `approved` reads as "Visible", and the
 * reason messages print the shared limits, the same numbers the API checks.
 */
const translator = (locale: "tr" | "en") => {
  const missing: string[] = [];
  const t = createTranslator({
    locale,
    messages: getMessages(locale),
    onError: (error) => missing.push(error.message),
  }) as unknown as Translate;
  return { t, missing };
};

const apiError = (i18nKey: string) => ({
  response: { data: { i18nKey, message: "server text" } },
});

describe.each(["tr", "en"] as const)("review status copy (%s)", (locale) => {
  it("labels every stored status from the catalog", () => {
    const { t, missing } = translator(locale);

    const labels = RATING_STATUSES.map((status) =>
      reviewStatusLabel(t, status),
    );

    expect(missing).toEqual([]);
    for (const label of labels) {
      expect(label).not.toMatch(/^admin\.accounts\.reviews\./);
    }
    expect(new Set(labels).size).toBe(RATING_STATUSES.length);
  });

  it("shows approved as Visible and hidden as Hidden", () => {
    const { t } = translator(locale);

    expect(reviewStatusLabel(t, "approved")).toBe(
      t("admin.accounts.reviews.status.visible"),
    );
    expect(reviewStatusLabel(t, "hidden")).toBe(
      t("admin.accounts.reviews.status.hidden"),
    );
    expect(Object.keys(reviewStatusConfig(t)).sort()).toEqual(
      [...RATING_STATUSES].sort(),
    );
  });

  it("prints the shared reason limits in the moderation errors", () => {
    const { t, missing } = translator(locale);

    const required = reviewModerationError(
      apiError("server.admin.review.reasonRequired"),
      t,
      "fallback",
    );
    const tooLong = reviewModerationError(
      apiError("server.admin.review.reasonTooLong"),
      t,
      "fallback",
    );

    expect(missing).toEqual([]);
    expect(required).toContain(String(REVIEW_MODERATION_REASON_MIN_LENGTH));
    expect(tooLong).toContain(String(REVIEW_MODERATION_REASON_MAX_LENGTH));
  });
});
