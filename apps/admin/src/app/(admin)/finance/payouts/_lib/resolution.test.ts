import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import type { Translate } from "@/lib/statusLabels";
import {
  PAYOUT_ACTION_ERRORS,
  canResolvePayoutTransfers,
  markPaidBody,
  parseTypedAmount,
  payoutActionError,
  retryTransferBody,
  typedAmountMatches,
} from "./resolution";
import { markPaidSchema, retryTransferSchema } from "./schema";

const tr = getMessages("tr");
const t = createTranslator({
  locale: "tr",
  messages: tr,
}) as unknown as Translate;

const apiError = (status: number, i18nKey?: string, message?: string) => ({
  response: { status, data: { statusCode: status, message, i18nKey } },
});

describe("payout transfer resolution", () => {
  describe("who may resolve", () => {
    it("super_admin and admin, like the API; not moderators", () => {
      expect(canResolvePayoutTransfers("super_admin")).toBe(true);
      expect(canResolvePayoutTransfers("admin")).toBe(true);
      expect(canResolvePayoutTransfers("moderator")).toBe(false);
      expect(canResolvePayoutTransfers(undefined)).toBe(false);
    });
  });

  describe("retry gated by the PayTR panel check", () => {
    const schema = retryTransferSchema(t);

    it("refuses without the panel check, with the message to tick it", () => {
      const result = schema.safeParse({
        confirmProviderChecked: false,
        reason: "PayTR panelinde yok",
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({
        path: ["confirmProviderChecked"],
        message: t(
          "admin.finance.payouts.resolution.confirmProviderCheckedRequired",
        ),
      });
    });

    it("refuses without a reason", () => {
      const result = schema.safeParse({
        confirmProviderChecked: true,
        reason: "   ",
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["reason"]);
    });

    it("sends the check and the trimmed reason", () => {
      const values = schema.parse({
        confirmProviderChecked: true,
        reason: "  Panelde bu trans_id yok  ",
      });
      expect(retryTransferBody(values)).toEqual({
        confirmProviderChecked: true,
        reason: "Panelde bu trans_id yok",
      });
    });

    it("a plain retry sends an empty body", () => {
      expect(retryTransferBody()).toEqual({});
      expect(retryTransferBody(null)).toEqual({});
    });
  });

  describe("mark as paid", () => {
    const resolution = {
      retryRequiresProviderCheck: false,
      markPaidMethod: "external_bank" as const,
      markPaidNetAmount: 1234.5,
      markPaidRequiresProviderCheck: false,
    };
    const schema = markPaidSchema(t, 1234.5);
    const valid = {
      confirmProviderChecked: false,
      reference: " DEKONT-42 ",
      reason: " Kalan tutar PayTR'de yok ",
      typedAmount: "1.234,50",
    };

    it("requires reference, reason and the typed net", () => {
      const result = schema.safeParse({
        confirmProviderChecked: false,
        reference: " ",
        reason: "",
        typedAmount: "",
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual([
        "reason",
        "reference",
        "typedAmount",
      ]);
    });

    it("refuses a typed amount that is not the net", () => {
      const result = schema.safeParse({ ...valid, typedAmount: "1234,05" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({
        path: ["typedAmount"],
        message: t("admin.finance.payouts.resolution.markPaidTypedMismatch"),
      });
    });

    it("limits the reference to the API's 120 characters", () => {
      expect(
        schema.safeParse({ ...valid, reference: "x".repeat(121) }).success,
      ).toBe(false);
    });

    it("sends the row's method and net, the trimmed reference and reason", () => {
      const values = schema.parse(valid);
      expect(markPaidBody(resolution, values)).toEqual({
        method: "external_bank",
        reference: "DEKONT-42",
        reason: "Kalan tutar PayTR'de yok",
        expectedNetAmount: 1234.5,
      });
      // The typed confirmation is never sent; the net is the row's.
      expect(markPaidBody(resolution, values)).not.toHaveProperty(
        "typedAmount",
      );
    });

    describe("a row whose earlier send PayTR never confirmed", () => {
      const checked = { ...resolution, markPaidRequiresProviderCheck: true };
      const gated = markPaidSchema(t, 1234.5, true);

      it("requires the PayTR panel check", () => {
        const result = gated.safeParse({
          ...valid,
          confirmProviderChecked: false,
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]).toMatchObject({
          path: ["confirmProviderChecked"],
          message: t(
            "admin.finance.payouts.resolution.confirmProviderCheckedRequired",
          ),
        });
      });

      it("sends confirmProviderChecked: true with the rest", () => {
        const values = gated.parse({ ...valid, confirmProviderChecked: true });
        expect(markPaidBody(checked, values)).toEqual({
          method: "external_bank",
          reference: "DEKONT-42",
          reason: "Kalan tutar PayTR'de yok",
          expectedNetAmount: 1234.5,
          confirmProviderChecked: true,
        });
      });
    });

    it("an ungated row needs no panel check and does not send one", () => {
      const values = schema.parse({ ...valid, confirmProviderChecked: false });
      expect(markPaidBody(resolution, values)).not.toHaveProperty(
        "confirmProviderChecked",
      );
    });

    it("sends nothing for a row without a mark-paid method", () => {
      expect(
        markPaidBody(
          { ...resolution, markPaidMethod: null, markPaidNetAmount: null },
          valid,
        ),
      ).toBeNull();
      expect(markPaidBody(undefined, valid)).toBeNull();
    });
  });

  describe("typed amount", () => {
    it.each([
      ["40", 40],
      ["40,5", 40.5],
      ["40.50", 40.5],
      ["₺1.234,56", 1234.56],
      ["1234,56 TL", 1234.56],
      ["1.234", 1234],
    ])("reads %s as %s", (input, value) => {
      expect(parseTypedAmount(input)).toBe(value);
    });

    it.each(["", "abc", "40,555", "-40", "4o"])("refuses %s", (input) => {
      expect(parseTypedAmount(input)).toBeNull();
    });

    it("matches to the kuruş", () => {
      expect(typedAmountMatches("0,1", 0.1)).toBe(true);
      expect(typedAmountMatches("40,01", 40)).toBe(false);
    });
  });

  describe("errors of the resolution endpoints", () => {
    const serverKeys = Object.keys(
      (tr as { server: { admin: { payout: Record<string, string> } } }).server
        .admin.payout,
    ).map((key) => `server.admin.payout.${key}`);

    it("handles every server.admin.payout.* key of the catalog", () => {
      expect(Object.keys(PAYOUT_ACTION_ERRORS).sort()).toEqual(
        serverKeys.sort(),
      );
    });

    it.each(serverKeys)("%s shows the API's message", (key) => {
      const error = payoutActionError(
        apiError(409, key, "Sunucunun mesajı"),
        "fallback",
      );
      expect(error.key).toBe(key);
      expect(error.message).toBe("Sunucunun mesajı");
    });

    it("reloads the list when the row changed or the list was stale", () => {
      for (const key of [
        "server.admin.payout.transferStateChanged",
        "server.admin.payout.markPaidAmountChanged",
        "server.admin.payout.markPaidNotAllowed",
        "server.admin.payout.markPaidPayoutBlocked",
        "server.admin.payout.markPaidMissingInput",
        "server.admin.payout.markPaidProviderCheckRequired",
        "server.admin.payout.providerCheckRequired",
        "server.admin.payout.retryStateInvalid",
        "server.admin.payout.transferNotFound",
      ]) {
        expect(payoutActionError(apiError(409, key), "f").refresh).toBe(true);
      }
    });

    it("marks the missing field and keeps the dialog", () => {
      expect(
        payoutActionError(
          apiError(400, "server.admin.payout.referenceRequired"),
          "f",
        ),
      ).toMatchObject({ refresh: false, field: "reference" });
      expect(
        payoutActionError(
          apiError(400, "server.admin.payout.reasonRequired"),
          "f",
        ),
      ).toMatchObject({ refresh: false, field: "reason" });
    });

    it("falls back for a network error or another key", () => {
      expect(payoutActionError(new Error("Network Error"), "Olmadı")).toEqual({
        key: null,
        message: "Olmadı",
        refresh: false,
      });
      expect(
        payoutActionError(
          apiError(403, "server.common.forbidden", "Yetkiniz yok"),
          "f",
        ),
      ).toEqual({ key: null, message: "Yetkiniz yok", refresh: false });
    });
  });
});
