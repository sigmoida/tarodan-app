/** @format */

import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceNumber, formatTL } from "./format";

/**
 * Para biçimi UYGULAMADA TEK olmalı.
 *
 * Ekranlar kendi `toLocaleString` çağrılarını yazdığında aynı ürün bir yerde
 * "468 ₺", başka yerde "468,19 TL" görünüyordu: kart formatı kuruşu atıp
 * YUVARLIYOR (414,50 → 415), detay ekranı ise iki ondalık gösteriyordu. Alıcı
 * için bu, kartta gördüğü fiyattan başka bir tutar ödemek demek.
 */
describe("para biçimi", () => {
  it("her zaman iki ondalık gösterir", () => {
    expect(formatPrice(468)).toBe("468,00 TL");
    expect(formatPrice(468.19)).toBe("468,19 TL");
    expect(formatPrice(414.5)).toBe("414,50 TL");
  });

  it("kuruşu YUVARLAMAZ, gösterir", () => {
    // Kart biçimi 414,50'yi 415'e yuvarlıyordu — gerçekte ödenecekten fazla.
    expect(formatPrice(414.5)).not.toBe("415,00 TL");
    expect(formatPrice(468.99)).toBe("468,99 TL");
  });

  it("binlik ayırıcı Türkçe kuralına uyar", () => {
    expect(formatPrice(1234.56)).toBe("1.234,56 TL");
    expect(formatPrice(1234567.89)).toBe("1.234.567,89 TL");
  });

  it("metin olarak gelen tutarı da çözer", () => {
    expect(formatPrice("468.19")).toBe("468,19 TL");
  });

  it("boş/geçersiz tutarda sıfır gösterir — NaN sızdırmaz", () => {
    expect(formatPrice(null)).toBe("0,00 TL");
    expect(formatPrice(undefined)).toBe("0,00 TL");
    expect(formatPrice("abc")).toBe("0,00 TL");
  });

  it("formatTL aynı biçimin adıdır", () => {
    expect(formatTL(468.19)).toBe(formatPrice(468.19));
  });

  it("sembolsüz biçim de iki ondalıklıdır", () => {
    expect(formatPriceNumber(468)).toBe("468,00");
    expect(formatPriceNumber(1234.5)).toBe("1.234,50");
    expect(formatPriceNumber(null)).toBe("0,00");
  });
});
