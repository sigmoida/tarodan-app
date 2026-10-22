/** @format */

import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import type { Translate } from "@/types/i18n";
import { negotiatedAmountError } from "./negotiatedAmount";

/** The real catalog: the copy and the ICU number format are under test too. */
const translator = (locale: "tr" | "en") =>
  createTranslator({
    locale,
    messages: getMessages(locale),
  }) as unknown as Translate;

describe("negotiatedAmountError", () => {
  const t = translator("tr");

  it.each(["", "12,50", "9999999", "9999999,00"])(
    "has no error for %j",
    (raw) => {
      expect(negotiatedAmountError(raw, t)).toBeUndefined();
    },
  );

  it("refuses text that is not an amount with the format copy", () => {
    expect(negotiatedAmountError("1.000", t)).toBe(
      "Tutar kabul edilmedi. Binlik ayracı kullanmayın; kuruş için virgül kullanın, örn. 1250,50",
    );
  });

  it.each(["10000000", "9999999,01"])(
    "refuses %j above the ceiling with the ceiling formatted",
    (raw) => {
      expect(negotiatedAmountError(raw, t)).toBe(
        "Tutar 9.999.999 TL'yi aşamaz.",
      );
      expect(negotiatedAmountError(raw, translator("en"))).toBe(
        "The amount cannot exceed 9,999,999 TL.",
      );
    },
  );
});
