// @vitest-environment jsdom
/** @format */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, ALL_ACCEPTED } from "./cookieConsent";

/**
 * gtag kuyruğunun kuruluş sözleşmesi: `consent default` her zaman `config`ten
 * ÖNCE ve verilen tercihe göre basılmalı — bu sıra bozulursa Consent Mode
 * devre dışı kalır ve rızasız çerez yazılır (KVKK ihlali). Modül durumu
 * (`initialized`) taşınmasın diye her test taze import alır.
 */

type QueueEntry = { 0?: unknown; 1?: unknown; 2?: unknown };

function queue(): QueueEntry[] {
  return (window as unknown as { dataLayer: QueueEntry[] }).dataLayer;
}

async function freshModule() {
  vi.resetModules();
  return import("./googleAds");
}

describe("initGoogleAdsTag", () => {
  beforeEach(() => {
    delete (window as { dataLayer?: unknown }).dataLayer;
    delete (window as { gtag?: unknown }).gtag;
  });

  it("varsayılan tercihlerle default sinyalleri denied basar ve sıra default → config olur", async () => {
    const { initGoogleAdsTag } = await freshModule();
    initGoogleAdsTag("AW-1", DEFAULT_PREFERENCES);

    const commands = queue().map((entry) => [entry[0], entry[1]]);
    expect(commands).toEqual([
      ["consent", "default"],
      ["js", expect.any(Date)],
      ["config", "AW-1"],
    ]);
    expect(queue()[0][2]).toMatchObject({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      security_storage: "granted",
    });
  });

  it("pazarlama rızası verilmiş tercihle default sinyalleri granted basar", async () => {
    const { initGoogleAdsTag } = await freshModule();
    initGoogleAdsTag("AW-1", { ...DEFAULT_PREFERENCES, marketing: true });

    expect(queue()[0][2]).toMatchObject({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "denied",
    });
  });

  it("idempotenttir — ikinci çağrı kuyruğa yeni komut eklemez", async () => {
    const { initGoogleAdsTag } = await freshModule();
    initGoogleAdsTag("AW-1", DEFAULT_PREFERENCES);
    const length = queue().length;
    initGoogleAdsTag("AW-1", ALL_ACCEPTED);
    expect(queue().length).toBe(length);
  });

  it("kuyruğa gerçek arguments nesnesi push'lar (gtag.js dizi kabul etmez)", async () => {
    const { initGoogleAdsTag } = await freshModule();
    initGoogleAdsTag("AW-1", DEFAULT_PREFERENCES);
    for (const entry of queue()) {
      expect(Array.isArray(entry)).toBe(false);
    }
  });
});

describe("updateGtagConsent", () => {
  beforeEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it("gtag yüklü değilken sessizce geçer (banner tag'siz sayfada da çalışır)", async () => {
    const { updateGtagConsent } = await freshModule();
    expect(() => updateGtagConsent(ALL_ACCEPTED)).not.toThrow();
  });

  it("yüklü gtag'e tercihi consent update olarak iletir", async () => {
    const gtag = vi.fn();
    (window as { gtag?: unknown }).gtag = gtag;
    const { updateGtagConsent } = await freshModule();
    updateGtagConsent(ALL_ACCEPTED);

    expect(gtag).toHaveBeenCalledWith(
      "consent",
      "update",
      expect.objectContaining({ ad_storage: "granted" }),
    );
  });
});
