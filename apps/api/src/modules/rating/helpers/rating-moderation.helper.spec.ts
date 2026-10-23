import { BadRequestException } from "@nestjs/common";
import {
  normalizeModerationReason,
  ratingModerationData,
} from "./rating-moderation.helper";

/** The localized payload (`i18nMessage`) of the 400 a call throws. */
const refusal = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).getResponse();
  }
  throw new Error("expected a BadRequestException");
};

describe("normalizeModerationReason", () => {
  describe("hiding (reason required, 5-500 characters after trim)", () => {
    it.each([undefined, null, "", "    ", "abcd", "  abcd  "])(
      "refuses %p with server.admin.review.reasonRequired",
      (reason) => {
        expect(
          refusal(() => normalizeModerationReason("hidden", reason)),
        ).toEqual({
          i18nKey: "server.admin.review.reasonRequired",
          i18nParams: { min: 5 },
        });
      },
    );

    it("accepts exactly 5 characters and trims the stored text", () => {
      expect(normalizeModerationReason("hidden", "  abcde \n")).toBe("abcde");
    });

    it("accepts exactly 500 characters", () => {
      const text = "x".repeat(500);
      expect(normalizeModerationReason("hidden", text)).toBe(text);
    });

    it("measures the maximum after trimming", () => {
      const text = "x".repeat(500);
      expect(normalizeModerationReason("hidden", `   ${text}   `)).toBe(text);
    });

    it("refuses 501 characters with server.admin.review.reasonTooLong", () => {
      expect(
        refusal(() => normalizeModerationReason("hidden", "x".repeat(501))),
      ).toEqual({
        i18nKey: "server.admin.review.reasonTooLong",
        i18nParams: { max: 500 },
      });
    });
  });

  describe("showing again (optional note)", () => {
    it.each([undefined, null, "", "   "])("turns %p into null", (reason) => {
      expect(normalizeModerationReason("approved", reason)).toBeNull();
    });

    it("keeps a short note: no minimum when showing again", () => {
      expect(normalizeModerationReason("approved", " ok ")).toBe("ok");
    });

    it("still caps the note at 500 characters", () => {
      expect(
        refusal(() => normalizeModerationReason("approved", "x".repeat(501))),
      ).toMatchObject({ i18nKey: "server.admin.review.reasonTooLong" });
    });
  });
});

describe("ratingModerationData", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");

  it("hiding writes the status, the reason, the time and the admin", () => {
    expect(ratingModerationData("hidden", "Spam link", "adm-1", now)).toEqual({
      status: "hidden",
      moderationReason: "Spam link",
      moderatedAt: now,
      moderatedByAdminId: "adm-1",
    });
  });

  it("showing again keeps the last hide reason (no moderationReason key)", () => {
    const data = ratingModerationData("approved", "a note", "adm-2", now);
    expect(data).toEqual({
      status: "approved",
      moderatedAt: now,
      moderatedByAdminId: "adm-2",
    });
    expect(data).not.toHaveProperty("moderationReason");
  });
});
