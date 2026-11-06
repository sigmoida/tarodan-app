/** @format */

import { createHash } from "node:crypto";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { getMessages, type Locale } from "@tarodan/i18n";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import type { LegalPart } from "@/components/legal/LegalDocument";
import type { Translate } from "@/types/i18n";
import { distanceSalesParts } from "./contract";

/**
 * User decision 2026-11-06: while installments are off the distance sales
 * text is exactly the one consented to as `2026-08-03`, before the
 * installment clauses (tarodan-ops plan 2026-11-03-installment-payments,
 * AS-L1). The rendered text is pinned here, in every locale, against the
 * recorded version: any change to the base text (structure or catalog copy)
 * fails this test and needs a new dated `version` in `@tarodan/types`.
 *
 * The hashes were taken from the parts of `294396c9f^` (the text before the
 * clauses), which render identically to the switch-off parts here.
 */
const BASE_TEXT_SHA256: Record<Locale, string> = {
  tr: "9dc9e84b7470a2132bb99a3d9a3ff96a68c1f121c2770bbffd32432a0572107b",
  en: "c2918f5d84e65ec01e0356997b5d07962b14f1915effba4ffafe1b40ee0a7f86",
};

const translatorFor = (locale: Locale): Translate =>
  createTranslator({
    locale,
    messages: getMessages(locale),
  }) as unknown as Translate;

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const CLAUSE_KEYS = [
  "legal.distanceSales.installmentTermsField",
  "legal.distanceSales.installmentPaymentTerms",
  "legal.distanceSales.installmentRefundTerms",
];

/** The translator that returns the key: which block is where. */
const keyTranslator = ((key: string) => key) as unknown as Translate;

/** The parts without the installment clause blocks and field. */
function withoutClauses(parts: LegalPart[]): LegalPart[] {
  const isClause = (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    Object.values(value).some((v) => CLAUSE_KEYS.includes(v as string));
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.filter((item) => !isClause(item)).map(strip);
    }
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [key, strip(v)]),
      );
    }
    return value;
  };
  return strip(parts) as LegalPart[];
}

describe("distance sales text: installments off is the 2026-08-03 text", () => {
  it.each<Locale>(["tr", "en"])(
    "the %s text with the switch off is the text recorded as the base version",
    (locale) => {
      expect(CONSENT_DOCUMENTS.distance_sales.version).toBe("2026-08-03");
      const parts = distanceSalesParts(translatorFor(locale), {
        installmentsEnabled: false,
      });
      expect(sha256(parts)).toBe(BASE_TEXT_SHA256[locale]);
    },
  );

  it("the switch on only adds the three clause blocks to that text", () => {
    const off = distanceSalesParts(keyTranslator, {
      installmentsEnabled: false,
    });
    const on = distanceSalesParts(keyTranslator, { installmentsEnabled: true });
    const onText = JSON.stringify(on);
    for (const key of CLAUSE_KEYS) {
      expect(onText.split(`"${key}"`)).toHaveLength(2);
      expect(JSON.stringify(off)).not.toContain(key);
    }
    expect(withoutClauses(on)).toEqual(off);
  });
});
