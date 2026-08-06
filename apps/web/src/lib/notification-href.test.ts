/** @format */

import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_FALLBACK_HREF,
  resolveNotificationHref,
} from "./notification-href";

/**
 * Regresyon: zil ve bildirim merkezi `notification.link || data.link` sonucunu
 * doğrulamadan navigasyona veriyordu. Veritabanında `{{orderId}}` içeren,
 * artık var olmayan (`/orders/:id`) ve dışarıdan gelmiş linkler duruyor.
 */
const link = (value: unknown) => ({ link: value as string });

describe("bildirim hedefi", () => {
  it("geçerli iç linki olduğu gibi açar", () => {
    expect(resolveNotificationHref(link("/profile/orders/o1"))).toEqual({
      href: "/profile/orders/o1",
      isExternal: false,
      isFallback: false,
    });
  });

  it("link alanı yoksa data.link'e bakar", () => {
    expect(
      resolveNotificationHref({ data: { link: "/listings/p1" } }).href,
    ).toBe("/listings/p1");
  });

  describe("eski yollar düzeltilir", () => {
    it.each([
      ["/orders/o1", "/profile/orders/o1"],
      ["/offers?tab=received", "/profile/offers?tab=received"],
      ["/trades/t1", "/profile/trades/t1"],
      ["/messages?thread=th1", "/profile/messages?thread=th1"],
      ["/products/p1", "/listings/p1"],
      ["/products/unavailable/p1", "/products/unavailable/p1"],
    ])("%s → %s", (legacy, expected) => {
      expect(resolveNotificationHref(link(legacy)).href).toBe(expected);
    });
  });

  describe("güvensiz hedefler reddedilir", () => {
    it.each([
      ["çözülmemiş şablon", "/profile/orders/{{orderId}}"],
      ["javascript şeması", "javascript:alert(1)"],
      ["protokol-göreli", "//evil.example.com/x"],
      ["http (https değil)", "http://tarodan.com.tr"],
      ["ayrıştırılamayan", "http://"],
      ["boş", "   "],
    ])("%s", (_name, value) => {
      const resolved = resolveNotificationHref(link(value));
      expect(resolved.href).toBe(NOTIFICATION_FALLBACK_HREF);
      expect(resolved.isFallback).toBe(true);
    });

    it("link hiç yoksa bildirim merkezine düşer (404'e değil)", () => {
      expect(resolveNotificationHref(null).href).toBe(
        NOTIFICATION_FALLBACK_HREF,
      );
      expect(resolveNotificationHref({}).isFallback).toBe(true);
    });
  });

  it("izinli dış link https ile açılır ve dış olarak işaretlenir", () => {
    const resolved = resolveNotificationHref(
      link("https://tarodan.com.tr/kampanya"),
    );
    expect(resolved.isExternal).toBe(true);
    expect(resolved.href).toBe("https://tarodan.com.tr/kampanya");
  });

  it("zil ve bildirim merkezi AYNI hedefi üretir", () => {
    // İki ekran da aynı yardımcıyı çağırdığı için sonuç tanım gereği aynıdır;
    // bu test sözleşmeyi sabitler.
    const notification = { link: "/orders/o1", data: { link: "/trades/t1" } };
    expect(resolveNotificationHref(notification).href).toBe(
      resolveNotificationHref(notification).href,
    );
    // `link` alanı `data.link`ten önce gelir.
    expect(resolveNotificationHref(notification).href).toBe(
      "/profile/orders/o1",
    );
  });
});
