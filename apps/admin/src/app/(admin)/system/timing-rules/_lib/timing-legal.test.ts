import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import {
  LEGAL_TIMING_STATEMENTS,
  TIMING_RULES,
  TIMING_RULE_IDS,
  legalTimingMismatch,
  type AdminTimingRuleState,
} from "@tarodan/types";
import { legalMismatchText, legalMismatchesOf } from "./timing-rules";

type T = ReturnType<typeof useTranslations<never>>;
/** Anahtarı (ve varsa parametreleri) geri döndüren sahte t. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as T;

const messageAt = (locale: "tr" | "en", key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      getMessages(locale),
    );

const stateWith = (patch: Record<string, number>): AdminTimingRuleState[] =>
  TIMING_RULE_IDS.map((id) => ({
    id,
    value: patch[id] ?? TIMING_RULES[id].default,
    source: "default",
    outOfBounds: false,
    action: TIMING_RULES[id].defaultAction,
    updatedAt: null,
  }));

/**
 * Hukuki metinler (mesafeli satış sözleşmesi, iade politikası, satıcı
 * sözleşmesi) birer SÖZLEŞMEDİR: içlerindeki süre sessizce ayara bağlanmaz.
 * Süreler ekranı, ayar metindeki sayıdan farklıysa uyarır; bu testler
 * (1) kayıtlı ifadelerin gerçekten metinde durduğunu, (2) metinlerin
 * parametreleştirilmediğini, (3) uyarının doğru kurduğunu sabitler.
 */
describe("hukuki metinlerdeki süre ifadeleri", () => {
  it.each(LEGAL_TIMING_STATEMENTS)(
    "$catalogKey metni $stated sayısını gerçekten içerir (tr + en)",
    ({ catalogKey, stated }) => {
      for (const locale of ["tr", "en"] as const) {
        const text = messageAt(locale, catalogKey);
        expect(typeof text).toBe("string");
        expect(text as string).toMatch(new RegExp(`\\b${stated}\\b`));
      }
    },
  );

  it.each(LEGAL_TIMING_STATEMENTS)(
    "$catalogKey sözleşme metni ICU parametresi taşımaz (sessizce ayara bağlı değil)",
    ({ catalogKey }) => {
      for (const locale of ["tr", "en"] as const) {
        expect(messageAt(locale, catalogKey) as string).not.toMatch(/\{\w+/);
      }
    },
  );

  it("her ifade yönetilen bir kurala bağlıdır", () => {
    for (const statement of LEGAL_TIMING_STATEMENTS) {
      expect(TIMING_RULE_IDS).toContain(statement.ruleId);
    }
  });

  it("kayıtlı sayı bugünkü varsayılanla uyumlu: varsayılanda çelişki yok", () => {
    for (const id of TIMING_RULE_IDS) {
      expect(legalTimingMismatch(id, TIMING_RULES[id].default)).toBeNull();
    }
  });
});

describe("legalTimingMismatch", () => {
  it("iade penceresi 30 gün olunca üç belgeyi de çelişkili işaretler", () => {
    expect(legalTimingMismatch("returnWindowDays", 30)).toEqual({
      stated: 14,
      documents: ["distanceSales", "refundPolicy", "sellerAgreement"],
    });
  });

  it("hazırlama süresi 5 gün olunca yalnız satıcı sözleşmesi çelişir", () => {
    expect(legalTimingMismatch("preparingDeadlineDays", 5)).toEqual({
      stated: 3,
      documents: ["sellerAgreement"],
    });
  });

  it("metinlerde geçmeyen süre için çelişki üretmez", () => {
    expect(legalTimingMismatch("offerExpiryHours", 99)).toBeNull();
  });
});

describe("legalMismatchesOf / legalMismatchText", () => {
  it("yalnız çelişen kayıtları listeler", () => {
    const conflicts = legalMismatchesOf(
      stateWith({ returnWindowDays: 21, preparingDeadlineDays: 3 }),
    );
    expect(conflicts.map(({ id }) => id)).toEqual(["returnWindowDays"]);
  });

  it("varsayılan ayarlarda uyarı yok", () => {
    expect(legalMismatchesOf(stateWith({}))).toEqual([]);
  });

  it("uyarı metni metindeki sayıyı ve belge adlarını taşır", () => {
    const mismatch = legalTimingMismatch("preparingDeadlineDays", 5)!;
    expect(legalMismatchText(t, mismatch)).toBe(
      'admin.timingRules.legalMismatchWarning:{"stated":3,"documents":"admin.timingRules.legalDocuments.sellerAgreement"}',
    );
  });
});
