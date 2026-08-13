import { BadRequestException } from "@nestjs/common";
import {
  normalizeSuratPhone,
  buildStandardGonderiPayload,
} from "./surat-address.util";

/**
 * `normalizeSuratPhone` eskiden çözemediği numaranın başına `0` ekleyip
 * gönderiyordu: `+447700900123` → `0447700900123`. Sürat'a uydurma bir TR
 * numarası gidiyor, kurye alıcıya ulaşamıyor, hiçbir yerde hata görünmüyordu.
 * Artık çözülemeyen numara boş dönüyor ve gönderi kurulumu net biçimde patlıyor.
 */

const VALID_INPUT = {
  recipientName: "Ada Lovelace",
  address: "Örnek Mah. 1. Sk. No:1",
  city: "İstanbul",
  district: "Kadıköy",
  phone: "+905300665841",
  ref: "ORD-10001",
};

describe("normalizeSuratPhone", () => {
  it("reduces every accepted spelling to 05XXXXXXXXX", () => {
    expect(normalizeSuratPhone("+905300665841")).toBe("05300665841");
    expect(normalizeSuratPhone("905300665841")).toBe("05300665841");
    expect(normalizeSuratPhone("05300665841")).toBe("05300665841");
    expect(normalizeSuratPhone("5300665841")).toBe("05300665841");
    expect(normalizeSuratPhone("+90 530 066 58 41")).toBe("05300665841");
  });

  it("returns empty instead of inventing a TR number it cannot resolve", () => {
    expect(normalizeSuratPhone("+447700900123")).toBe("");
    expect(normalizeSuratPhone("+13105551234")).toBe("");
    expect(normalizeSuratPhone("0212 555 44 33")).toBe("");
    expect(normalizeSuratPhone("")).toBe("");
    expect(normalizeSuratPhone(null)).toBe("");
  });
});

describe("buildStandardGonderiPayload", () => {
  it("carries the normalized phone through", () => {
    expect(buildStandardGonderiPayload(VALID_INPUT).TelefonCep).toBe(
      "05300665841",
    );
  });

  it("refuses to build a shipment for an unresolvable number", () => {
    expect(() =>
      buildStandardGonderiPayload({
        ...VALID_INPUT,
        phone: "+447700900123",
      }),
    ).toThrow(BadRequestException);
  });
});
