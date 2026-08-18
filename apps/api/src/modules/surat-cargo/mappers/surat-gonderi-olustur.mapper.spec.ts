import { BadRequestException } from "@nestjs/common";
import { buildGonderiOlusturData } from "./surat-gonderi-olustur.mapper";
import {
  SuratGonderiDurumu,
  SuratGonderiOlusturSekli,
  SuratKimOder,
  type SuratCreateShipmentInput,
} from "../helpers/surat-cargo.types";

/**
 * v2 eşlemesi üç yeni dönüşüm getiriyor ve üçü de sessizce yanlış olabilir:
 * il ADI → PLAKA, tek `fullName` → `Adi`/`Soyadi`, ve gönderici tarafının artık
 * gerçekten doldurulması. Yanlış plaka = yanlış ile açılmış fiziksel koli.
 */

const shipment: SuratCreateShipmentInput = {
  reference: "PKG-42",
  sender: {
    name: "Mehmet Satıcı",
    address: "Depo Mah. Sevk Cad. No:1",
    city: "İstanbul",
    district: "Maltepe",
    phone: "05559876543",
    email: "satici@example.com",
  },
  recipient: {
    name: "Ayşe Nur Kaya",
    address: "Atatürk Cad. No:5",
    city: "Ankara",
    district: "Çankaya",
    phone: "+90 555 111 22 33",
  },
};

describe("buildGonderiOlusturData", () => {
  it("maps both parties, and does not swap them", () => {
    const data = buildGonderiOlusturData(shipment);

    expect(data.Gonderen).toEqual({
      MusteriId: "05559876543",
      Adi: "Mehmet",
      Soyadi: "Satıcı",
      Telefon: "05559876543",
      Email: "satici@example.com",
      Adres: "Depo Mah. Sevk Cad. No:1",
      IlId: 34,
      IlceAdi: "Maltepe",
    });
    expect(data.Alici).toEqual({
      MusteriId: "05551112233",
      Adi: "Ayşe Nur",
      Soyadi: "Kaya",
      Telefon: "05551112233",
      Email: "",
      Adres: "Atatürk Cad. No:5",
      IlId: 6,
      IlceAdi: "Çankaya",
    });
  });

  it("carries our reference as SatisKodu — the tracking endpoint's key", () => {
    // Takip ucu bu planda DEĞİŞMİYOR; aynı referansla sorgulanabilmesi
    // migrasyonun dayandığı varsayım.
    expect(buildGonderiOlusturData(shipment).SatisKodu).toBe("PKG-42");
  });

  it("bills the platform, not the sender", () => {
    // Gönderici artık satıcı ama kargoyu escrow'dan platform ödüyor
    // (docs/SHIPPING.md §5). GondericiOder faturayı satıcıya çıkarırdı.
    expect(buildGonderiOlusturData(shipment).KimOder).toBe(
      SuratKimOder.EntegrasyonFirmasiOder,
    );
  });

  it("sends the parcel's desi as the shipment total, defaulting to 1", () => {
    expect(buildGonderiOlusturData({ ...shipment, desi: 4 }).Desi).toBe(4);
    expect(buildGonderiOlusturData(shipment).Desi).toBe(1);
    expect(buildGonderiOlusturData({ ...shipment, desi: 0 }).Desi).toBe(1);
    expect(buildGonderiOlusturData({ ...shipment, desi: null }).Desi).toBe(1);
  });

  it("fills the standard envelope constants", () => {
    const data = buildGonderiOlusturData(shipment);
    expect(data.Adet).toBe(1);
    expect(data.Kg).toBe(1);
    expect(data.GonderiDurumu).toBe(SuratGonderiDurumu.Kullanilmadi);
    expect(data.GonderiSekli).toBe(SuratGonderiOlusturSekli.Standart);
    expect(data.IsKapidanTahsilat).toBe(false);
    expect(data.KapidaTahsilatTutari).toBe(0);
  });

  it("expresses a return by swapping the parties, not by a flag", () => {
    // v2'de `Iademi` yok. Yön zaten gönderen/alıcı ile ifade edildiği için
    // `isReturn` tele hiç çıkmamalı.
    const outbound = buildGonderiOlusturData(shipment);
    const asReturn = buildGonderiOlusturData({ ...shipment, isReturn: true });
    expect(asReturn).toEqual(outbound);
    expect(JSON.stringify(asReturn)).not.toContain("Iademi");

    const swapped = buildGonderiOlusturData({
      ...shipment,
      sender: shipment.recipient,
      recipient: shipment.sender,
      isReturn: true,
    });
    expect(swapped.Gonderen.IlId).toBe(6);
    expect(swapped.Alici.IlId).toBe(34);
  });

  describe("province resolution", () => {
    it.each([
      ["İstanbul", 34],
      ["istanbul", 34],
      ["ISTANBUL", 34],
      ["  Kahramanmaraş ", 46],
      ["Şanlıurfa", 63],
      ["Afyon Karahisar", 3],
    ])("resolves %s to plate code %i", (city, plateCode) => {
      const data = buildGonderiOlusturData({
        ...shipment,
        recipient: { ...shipment.recipient, city: city as string },
      });
      expect(data.Alici.IlId).toBe(plateCode);
    });

    it("fails closed on an unknown province rather than guessing", () => {
      expect(() =>
        buildGonderiOlusturData({
          ...shipment,
          recipient: { ...shipment.recipient, city: "Berlin" },
        }),
      ).toThrow(BadRequestException);
    });

    it("fails closed when the SENDER's province is unknown too", () => {
      // Gönderici tarafı sessizce atlanırsa koli kimliksiz çıkar.
      expect(() =>
        buildGonderiOlusturData({
          ...shipment,
          sender: { ...shipment.sender, city: "" },
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe("phone", () => {
    it("normalizes both sides to the national format", () => {
      const data = buildGonderiOlusturData({
        ...shipment,
        sender: { ...shipment.sender, phone: "+90 555 987 65 43" },
      });
      expect(data.Gonderen.Telefon).toBe("05559876543");
      expect(data.Alici.Telefon).toBe("05551112233");
    });

    it("fails closed on an unresolvable phone", () => {
      expect(() =>
        buildGonderiOlusturData({
          ...shipment,
          recipient: { ...shipment.recipient, phone: "+447700900123" },
        }),
      ).toThrow(BadRequestException);
    });

    it("names the failing party, so nobody chases the wrong address", () => {
      const senderFailure = (() => {
        try {
          buildGonderiOlusturData({
            ...shipment,
            sender: { ...shipment.sender, phone: "+447700900123" },
          });
        } catch (error) {
          return error as { response?: { i18nKey?: string } };
        }
      })();

      expect(JSON.stringify(senderFailure)).toContain("invalidSenderPhone");
    });
  });

  describe("name splitting", () => {
    it("treats the last word as the family name", () => {
      const data = buildGonderiOlusturData({
        ...shipment,
        recipient: { ...shipment.recipient, name: "Ali Rıza Demir Kaya" },
      });
      expect(data.Alici.Adi).toBe("Ali Rıza Demir");
      expect(data.Alici.Soyadi).toBe("Kaya");
    });

    it("repeats a single-word name — Soyadi cannot be empty", () => {
      const data = buildGonderiOlusturData({
        ...shipment,
        recipient: { ...shipment.recipient, name: "Tarodan" },
      });
      expect(data.Alici).toMatchObject({ Adi: "Tarodan", Soyadi: "Tarodan" });
    });
  });
});
