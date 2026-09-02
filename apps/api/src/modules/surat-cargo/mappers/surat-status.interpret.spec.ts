import { ShipmentStatus } from "@prisma/client";
import { interpretSuratTracking } from "./surat-status.mapper";

/**
 * Sürat'ın kod tablosu canlıyla tutmuyor; karar kod + iade bayrağı + tamamlanma
 * sinyalleriyle verilir. Fixture'lar 2026-09-02'de canlıdan çekilen gerçek
 * cevaplardır (PKG-2HGNFGEGTD) ve prod vakası PKG-56HMSK9TX5'tir.
 */
describe("interpretSuratTracking", () => {
  /** PKG-2HGNFGEGTD, 1 Eylül 15:00 UTC: koli şubede, Sürat üst kodu 9 dedi. */
  const transientReturnCode = {
    KargonunDurumuSayi: 9,
    KargonunDurumu: "İade Sürecinde",
    IadeDurum: "Hayır",
    Hareketler: [
      {
        Islem: "Kargo Araca Yüklendi",
        IslemTarihi: "2026-09-01T17:54:20.000",
        KargoHareketKargonunDurumuSayi: "1",
      },
      {
        Islem: "Evrak Oluşturuldu",
        IslemTarihi: "2026-09-01T17:54:13.813",
        KargoHareketKargonunDurumuSayi: "1",
      },
      {
        Islem: "Araç Varış Yaptı",
        IslemTarihi: "2026-09-01T17:53:20.000",
        KargoHareketKargonunDurumuSayi: "4",
      },
    ],
  };

  /** Aynı koli, 2 Eylül: alıcıya teslim, iade bayrağı yok. */
  const deliveredToBuyer = {
    KargonunDurumuSayi: 6,
    KargonunDurumu: "Teslim Edildi",
    IadeDurum: "Hayır",
    Hareketler: [
      {
        Islem: "Teslim Edildi",
        IslemTarihi: "2026-09-02T10:57:12.000",
        KargoHareketKargonunDurumuSayi: "6",
      },
      {
        Islem: "Kurye Dağıtıma Çıktı",
        IslemTarihi: "2026-09-02T10:36:07.000",
        KargoHareketKargonunDurumuSayi: "5",
      },
    ],
  };

  /** PKG-56HMSK9TX5: tamamlanmış iade canlıda 12 değil 13 ile geldi. */
  const completedReturn = {
    KargonunDurumuSayi: 13,
    KargonunDurumu: "Teslim Edildi (İade)",
    IadeDurum: "Evet",
    Hareketler: [
      { Islem: "İade Edildi", IslemTarihi: "2026-08-21T12:09:50.403" },
    ],
  };

  it("does NOT treat a return code as a return when Sürat's return flag is off", () => {
    const reading = interpretSuratTracking(transientReturnCode);
    expect(reading.isReturnFlow).toBe(false);
    expect(reading.isDelivered).toBe(false);
    // Konum en son hareketten türer (17:54:20 "Kargo Araca Yüklendi", kod 1).
    expect(reading.status).toBe(ShipmentStatus.picked_up);
  });

  it("picks the LATEST movement by date, not by list position", () => {
    const reading = interpretSuratTracking({
      ...transientReturnCode,
      Hareketler: [...transientReturnCode.Hareketler].reverse(),
    });
    expect(reading.status).toBe(ShipmentStatus.picked_up);
  });

  it("keeps the local status when a flagless return code has no usable movement", () => {
    expect(
      interpretSuratTracking({ ...transientReturnCode, Hareketler: [] }).status,
    ).toBeNull();
    expect(
      interpretSuratTracking({
        ...transientReturnCode,
        Hareketler: [{ Islem: "x", KargoHareketKargonunDurumuSayi: "9" }],
      }).status,
    ).toBeNull();
  });

  it("reads the flagged return code as a genuine return in progress", () => {
    const reading = interpretSuratTracking({
      ...transientReturnCode,
      IadeDurum: "Evet",
    });
    expect(reading).toEqual({
      status: ShipmentStatus.return_in_progress,
      isDelivered: false,
      isReturnFlow: true,
      isReturnCompleted: false,
    });
  });

  it("reads a flagless delivery as delivered to the buyer", () => {
    expect(interpretSuratTracking(deliveredToBuyer)).toEqual({
      status: ShipmentStatus.delivered,
      isDelivered: true,
      isReturnFlow: false,
      isReturnCompleted: false,
    });
  });

  it("refuses to decide a flagged delivery without a completion signal", () => {
    const reading = interpretSuratTracking({
      ...deliveredToBuyer,
      IadeDurum: "Evet",
    });
    expect(reading.status).toBeNull();
    expect(reading.isDelivered).toBe(false);
    expect(reading.isReturnFlow).toBe(true);
  });

  it("reads a completed return as returned regardless of the code table", () => {
    expect(interpretSuratTracking(completedReturn)).toEqual({
      status: ShipmentStatus.returned,
      isDelivered: false,
      isReturnFlow: true,
      isReturnCompleted: true,
    });
  });

  it("maps plain forward codes through the table and leaves unknown codes alone", () => {
    expect(
      interpretSuratTracking({ KargonunDurumuSayi: 5, IadeDurum: "Hayır" })
        .status,
    ).toBe(ShipmentStatus.out_for_delivery);
    expect(
      interpretSuratTracking({ KargonunDurumuSayi: 42, IadeDurum: "Hayır" }),
    ).toEqual({
      status: null,
      isDelivered: false,
      isReturnFlow: false,
      isReturnCompleted: false,
    });
  });
});
