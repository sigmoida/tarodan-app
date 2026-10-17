// @vitest-environment jsdom
/** @format */

import { beforeEach, describe, expect, it } from "vitest";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import {
  CONSENT_KEY,
  CONSENT_VERSION_KEY,
  VISITOR_ID_KEY,
  getOrCreateVisitorId,
  hasConsent,
  isConsentCurrent,
} from "./cookieConsent";

/**
 * Çerez rızası, verildiği Çerez Politikası sürümüne bağlıdır: politika
 * değişince bant yeniden çıkar (hesap belgelerindeki yeniden-onay kuralının
 * çerez karşılığı). Ziyaretçi kimliği sunucudaki onay kaydının sahibidir.
 */
describe("cookie consent version", () => {
  beforeEach(() => localStorage.clear());

  it("yürürlükteki sürüme verilmiş rıza geçerlidir", () => {
    expect(isConsentCurrent("true", CONSENT_DOCUMENTS.cookies.version)).toBe(
      true,
    );
  });

  it("politika sürümü değişince eski rıza geçersizdir (bant yeniden çıkar)", () => {
    expect(isConsentCurrent("true", "2020-01-01")).toBe(false);
  });

  it("sürüm kaydı olmayan (bu değişiklikten önceki) rıza geçersizdir", () => {
    localStorage.setItem(CONSENT_KEY, "true");

    expect(hasConsent()).toBe(false);

    localStorage.setItem(
      CONSENT_VERSION_KEY,
      CONSENT_DOCUMENTS.cookies.version,
    );
    expect(hasConsent()).toBe(true);
  });
});

describe("getOrCreateVisitorId", () => {
  beforeEach(() => localStorage.clear());

  it("bir kez üretir ve sonra aynı kimliği döner", () => {
    const first = getOrCreateVisitorId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(getOrCreateVisitorId()).toBe(first);
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe(first);
  });
});
