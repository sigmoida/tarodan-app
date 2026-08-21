import { ConfigService } from "@nestjs/config";
import { SuratTrackingClient } from "./surat-tracking.client";

/**
 * Sürat tarihleri ofsetsiz gelir ve Türkiye saatidir. Bu ayrım prod'da
 * gözle görülür şekilde bozulmuştu: hareketler 3 saat ileriye yazılıyor,
 * `shipment_events` zaman çizelgesi kendisini gören poll'dan sonraya düşüyordu.
 * Testler ofseti değil MUTLAK ANI doğruluyor — makinenin TZ'sinden bağımsız.
 */
describe("SuratTrackingClient.parseSuratDate", () => {
  const client = new SuratTrackingClient(new ConfigService());

  it("reads a zoneless ISO timestamp as Turkish local time", () => {
    // Prod verisinden: "Teslim Edildi" hareketi 10:51:48.520 (TR) = 07:51:48.520Z
    expect(
      client.parseSuratDate("2026-08-21T10:51:48.520")?.toISOString(),
    ).toBe("2026-08-21T07:51:48.520Z");
  });

  it("reads a date-only value as Turkish midnight, not UTC midnight", () => {
    expect(client.parseSuratDate("21/08/2026")?.toISOString()).toBe(
      "2026-08-20T21:00:00.000Z",
    );
  });

  it("reads dotted dates with a time the same way", () => {
    expect(client.parseSuratDate("25.07.2024 16:54:15")?.toISOString()).toBe(
      "2024-07-25T13:54:15.000Z",
    );
  });

  it("keeps an explicit zone when the carrier sends one", () => {
    // Ofset varsa dokunma — ikinci kez +03:00 eklemek anı kaydırırdı.
    expect(
      client.parseSuratDate("2026-08-21T10:51:48.520Z")?.toISOString(),
    ).toBe("2026-08-21T10:51:48.520Z");
  });

  it("still returns null rather than an Invalid Date", () => {
    expect(client.parseSuratDate("bilinmeyen")).toBeNull();
    expect(client.parseSuratDate("")).toBeNull();
  });
});
