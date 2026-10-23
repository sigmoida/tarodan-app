import { describe, expect, it } from "vitest";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { isReviewStatusChanged, reviewModerationError } from "./errors";

/** Echoes key and params, so the test shows what the message was built from. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${JSON.stringify(params)}` : key) as unknown as Translate;

const apiError = (i18nKey: string | undefined, message = "server text") => ({
  response: { status: 400, data: { i18nKey, message } },
});

describe("reviewModerationError", () => {
  it("names the minimum for reasonRequired", () => {
    expect(
      reviewModerationError(
        apiError("server.admin.review.reasonRequired"),
        t,
        "fallback",
      ),
    ).toBe(
      `server.admin.review.reasonRequired|${JSON.stringify({
        min: REVIEW_MODERATION_REASON_MIN_LENGTH,
      })}`,
    );
  });

  it("names the maximum for reasonTooLong", () => {
    expect(
      reviewModerationError(
        apiError("server.admin.review.reasonTooLong"),
        t,
        "fallback",
      ),
    ).toBe(
      `server.admin.review.reasonTooLong|${JSON.stringify({
        max: REVIEW_MODERATION_REASON_MAX_LENGTH,
      })}`,
    );
  });

  it("keeps the server text for statusChanged and other errors", () => {
    expect(
      reviewModerationError(
        apiError("server.admin.review.statusChanged", "Status just changed"),
        t,
        "fallback",
      ),
    ).toBe("Status just changed");
    expect(reviewModerationError(apiError(undefined, ""), t, "fallback")).toBe(
      "fallback",
    );
    expect(reviewModerationError(new Error("offline"), t, "fallback")).toBe(
      "fallback",
    );
  });
});

describe("isReviewStatusChanged", () => {
  it("is true only for the statusChanged key", () => {
    expect(
      isReviewStatusChanged({
        response: {
          status: 409,
          data: { i18nKey: "server.admin.review.statusChanged" },
        },
      }),
    ).toBe(true);
    expect(
      isReviewStatusChanged(apiError("server.admin.review.notFound")),
    ).toBe(false);
    expect(isReviewStatusChanged(undefined)).toBe(false);
  });
});
