import { ConfigService } from "@nestjs/config";
import { ShipmentStatus } from "@prisma/client";
import {
  buildSimulatedSuratReading,
  formatSuratLocalDate,
  simulatedCarrierCode,
} from "./surat-simulated-reading";
import { interpretSuratTracking } from "../mappers/surat-status.mapper";
import { SuratTrackingClient } from "../clients/surat-tracking.client";

/**
 * Sentetik okuma, gerçek okumanın geçtiği yorumlayıcıdan BELİRSİZLİKSİZ geçmeli:
 * yorum yanlış statü ya da "iade" üretirse simülasyon gerçekte olmayan bir yolu
 * test eder.
 */
describe("buildSimulatedSuratReading", () => {
  const at = new Date("2026-10-05T10:04:05.000Z");

  it("picked_up is read as the first physical handoff — not delivered, not a return", () => {
    const gonderi = buildSimulatedSuratReading({
      step: "picked_up",
      carrierCode: "STUB0000012345",
      at,
    });
    expect(interpretSuratTracking(gonderi)).toEqual({
      status: ShipmentStatus.picked_up,
      isDelivered: false,
      isReturnFlow: false,
      isReturnCompleted: false,
    });
    // Order poll'u ilk kabulü KargoTakipNo varlığından anlar.
    expect(gonderi.KargoTakipNo).toBe("STUB0000012345");
    expect(gonderi.TeslimTarihi).toBe("");
  });

  it("delivered is read as delivery to the recipient — never as a completed return", () => {
    const gonderi = buildSimulatedSuratReading({
      step: "delivered",
      carrierCode: "STUB0000012345",
      at,
    });
    expect(interpretSuratTracking(gonderi)).toEqual({
      status: ShipmentStatus.delivered,
      isDelivered: true,
      isReturnFlow: false,
      isReturnCompleted: false,
    });
    expect(gonderi.IadeDurum).toBe("Hayır");
  });

  it("writes no carrier cost, tracking URL or planned date", () => {
    const gonderi = buildSimulatedSuratReading({
      step: "delivered",
      carrierCode: "X",
      at,
    });
    expect(gonderi.Tutar).toBe(0);
    expect(gonderi.TakipUrl).toBe("");
    expect(gonderi.PlanlananTeslimTarihi).toBe("");
  });

  it("carries one movement row so the shipment timeline shows the event", () => {
    const gonderi = buildSimulatedSuratReading({
      step: "picked_up",
      carrierCode: "X",
      at,
    });
    expect(gonderi.Hareketler).toHaveLength(1);
    expect(gonderi.Hareketler[0]).toMatchObject({
      Islem: "Kargo Kabul",
      KargoHareketKargonunDurumuSayi: "1",
    });
  });

  it("round-trips its dates through the tracking client's parser (delivery time is exact)", () => {
    const client = new SuratTrackingClient(new ConfigService());
    const gonderi = buildSimulatedSuratReading({
      step: "delivered",
      carrierCode: "X",
      at,
    });
    expect(client.parseSuratDate(gonderi.TeslimTarihi)?.toISOString()).toBe(
      at.toISOString(),
    );
    expect(
      client.parseSuratDate(gonderi.Hareketler[0].IslemTarihi)?.toISOString(),
    ).toBe(at.toISOString());
  });
});

describe("formatSuratLocalDate", () => {
  it("renders Turkish local time without an offset, as Sürat does", () => {
    expect(formatSuratLocalDate(new Date("2026-10-05T21:30:00.000Z"))).toBe(
      "2026-10-06T00:30:00.000",
    );
  });
});

describe("simulatedCarrierCode", () => {
  it("uses a SIM prefix that cannot collide with real, TEST or STUB codes", () => {
    expect(simulatedCarrierCode("PKG-000123456")).toBe("SIM0000123456");
    expect(simulatedCarrierCode("RF-1")).toBe("SIM0000000001");
  });
});
