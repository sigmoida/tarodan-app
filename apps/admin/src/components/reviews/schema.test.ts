import { describe, expect, it } from "vitest";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { reviewModerationSchema, toModerationRequest } from "./schema";

/** Returns the key, so the test shows which rule spoke. */
const t = ((key: string) => key) as unknown as Translate;

const issue = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) => result.error?.issues[0];

describe("reviewModerationSchema (hide)", () => {
  const schema = reviewModerationSchema(t, "hidden");
  const minLength = REVIEW_MODERATION_REASON_MIN_LENGTH;
  const maxLength = REVIEW_MODERATION_REASON_MAX_LENGTH;

  it("requires a reason", () => {
    const result = schema.safeParse({ reason: "" });

    expect(result.success).toBe(false);
    expect(issue(result)).toMatchObject({
      path: ["reason"],
      message: "server.admin.review.reasonRequired",
    });
  });

  it("counts the trimmed reason, so whitespace padding does not pass", () => {
    const padded = `  ${"a".repeat(minLength - 1)}  `;

    expect(schema.safeParse({ reason: padded }).success).toBe(false);
    expect(
      schema.safeParse({ reason: `  ${"a".repeat(minLength)}  ` }).success,
    ).toBe(true);
  });

  it("accepts the maximum and rejects one more", () => {
    expect(schema.safeParse({ reason: "a".repeat(maxLength) }).success).toBe(
      true,
    );

    const result = schema.safeParse({ reason: "a".repeat(maxLength + 1) });
    expect(result.success).toBe(false);
    expect(issue(result)?.message).toBe("server.admin.review.reasonTooLong");
  });
});

describe("reviewModerationSchema (show again)", () => {
  const schema = reviewModerationSchema(t, "approved");

  it("takes an empty note", () => {
    expect(schema.safeParse({ reason: "" }).success).toBe(true);
    expect(schema.safeParse({ reason: "   " }).success).toBe(true);
  });

  it("keeps the same maximum", () => {
    const tooLong = "a".repeat(REVIEW_MODERATION_REASON_MAX_LENGTH + 1);

    expect(schema.safeParse({ reason: tooLong }).success).toBe(false);
  });
});

describe("toModerationRequest", () => {
  it("sends the trimmed reason with hidden", () => {
    expect(
      toModerationRequest("hidden", { reason: "  Abusive text  " }),
    ).toEqual({ status: "hidden", reason: "Abusive text" });
  });

  it("sends the note with approved when given", () => {
    expect(
      toModerationRequest("approved", { reason: "Appeal accepted" }),
    ).toEqual({ status: "approved", reason: "Appeal accepted" });
  });

  it("leaves a blank note out of the body", () => {
    expect(toModerationRequest("approved", { reason: "   " })).toEqual({
      status: "approved",
    });
  });
});
