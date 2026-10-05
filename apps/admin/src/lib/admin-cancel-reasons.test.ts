import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  ADMIN_CANCEL_REASON_CODES,
  ADMIN_CANCEL_REASON_I18N_KEYS,
} from "@tarodan/types";
import {
  adminCancelReasonFilterOptions,
  adminCancelReasonOptions,
  platformCancelReasonCode,
} from "./admin-cancel-reasons";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as unknown as T;

describe("admin iptal nedenleri", () => {
  it("form seçenekleri katalogdaki her kodu, katalog etiketiyle verir", () => {
    expect(adminCancelReasonOptions(t)).toEqual(
      ADMIN_CANCEL_REASON_CODES.map((code) => ({
        value: code,
        label: ADMIN_CANCEL_REASON_I18N_KEYS[code],
      })),
    );
  });

  it("filtre seçenekleri 'Tümü' ile başlar", () => {
    expect(adminCancelReasonFilterOptions(t)[0]).toEqual({
      value: "all",
      label: "common.all",
    });
    expect(adminCancelReasonFilterOptions(t)).toHaveLength(
      ADMIN_CANCEL_REASON_CODES.length + 1,
    );
  });

  it("kod yalnız platform iptalinde ve katalogdaysa okunur", () => {
    expect(
      platformCancelReasonCode({
        cancelledBy: "platform",
        adminCancelReasonCode: "stock_error",
      }),
    ).toBe("stock_error");
    expect(
      platformCancelReasonCode({
        cancelledBy: "buyer",
        adminCancelReasonCode: "stock_error",
      }),
    ).toBeNull();
    expect(
      platformCancelReasonCode({
        cancelledBy: "platform",
        adminCancelReasonCode: "unknown_code",
      }),
    ).toBeNull();
    expect(
      platformCancelReasonCode({
        cancelledBy: "platform",
        adminCancelReasonCode: null,
      }),
    ).toBeNull();
  });
});
