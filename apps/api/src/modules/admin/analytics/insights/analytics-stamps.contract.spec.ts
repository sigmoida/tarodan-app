import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Analitik ekranının İKİ değişmezi — ikisi de sessizce bozulabilir, bu yüzden
 * kaynağın kendisinden denetlenir.
 *
 * 1. Her rakam kendi OLAY damgasından okunur (`status + createdAt` değil).
 * 2. Toplama SQL'de yapılır; satırlar belleğe çekilip gruplanmaz.
 *
 * İkincisi ölçeklenme meselesi değil yalnız: eski `getSalesAnalytics` bütün
 * dönemin siparişlerini çekip JS'te grupluyor ve kova anahtarını `toISOString()`
 * ile üretiyordu — ölçüm dürüstlüğü de oradan kayıyordu.
 */
const INSIGHTS_DIR = __dirname;

function insightsSources(): Array<{ file: string; source: string }> {
  return readdirSync(INSIGHTS_DIR)
    .filter((name) => name.endsWith(".service.ts"))
    .map((name) => ({
      file: name,
      source: readFileSync(join(INSIGHTS_DIR, name), "utf8"),
    }));
}

/**
 * Sekme → ölçümün okunduğu damga kolonları. Tablo SÖZLEŞMEDİR: bir metriğin
 * damgası değiştirilirse burası da değişmek zorunda, yani değişiklik görünür
 * olur.
 */
const EXPECTED_STAMPS: Record<string, string[]> = {
  // Ciro ödeme anından, net gelir hak ediş anından, iade iade anından.
  "analytics-sales.service.ts": ['"paid_at"', '"earned_at"', '"refunded_at"'],
  // Takas hunisi kendi damgalarından; takas ücreti ödeme anından.
  "analytics-trade.service.ts": [
    '"created_at"',
    '"completed_at"',
    '"paid_at"',
    "acceptedAt",
    "rejectedAt",
    "respondedAt",
  ],
  // İlan hunisi yayın ve satış anından; öne çıkarma satın alma anından.
  "analytics-catalog.service.ts": [
    '"published_at"',
    '"sold_at"',
    '"purchased_at"',
  ],
  // İade iade anından, iptal iptal anından, teslim süresi teslim anından.
  "analytics-quality.service.ts": [
    '"refunded_at"',
    '"cancelled_at"',
    '"delivered_at"',
  ],
  // Üyelik ödemesinin kendi anı; `MembershipPayment`in updatedAt'i yok.
  // Ödemesiz kalma da artık AKIŞ: `pastDueAt`.
  "analytics-membership.service.ts": [
    '"created_at"',
    "cancelledAt",
    "pastDueAt",
  ],
};

describe("analitik ölçüm sözleşmesi", () => {
  it("her sekme beklenen olay damgalarından ölçer", () => {
    for (const [file, stamps] of Object.entries(EXPECTED_STAMPS)) {
      const source = readFileSync(join(INSIGHTS_DIR, file), "utf8");
      for (const stamp of stamps) {
        expect([file, stamp, source.includes(stamp)]).toEqual([
          file,
          stamp,
          true,
        ]);
      }
    }
  });

  it("her sekme servisi sözleşmede sayılıdır", () => {
    const measured = insightsSources()
      .map((entry) => entry.file)
      // Dışa aktarım ölçmez, ölçüleni yazar.
      .filter((file) => file !== "analytics-export.service.ts")
      .filter((file) => file !== "analytics-tab.service.ts");

    expect(measured.sort()).toEqual(Object.keys(EXPECTED_STAMPS).sort());
  });

  it("satırları belleğe çekip gruplamaz", () => {
    const offenders = insightsSources()
      .filter((entry) => /\.findMany\(/.test(entry.source))
      .map((entry) => entry.file);

    expect(offenders).toEqual([]);
  });

  /**
   * `status` "şu an ne" sorusunu yanıtlar, "bu dönemde ne oldu"yu değil. Tek
   * meşru istisnaları: ödeme/defter satırının GEÇERLİLİĞİNİ daraltmak
   * (tamamlanmış ödeme, feragat edilmemiş defter, başarısız olmayan boost) ve
   * kabul edilmiş teklifin durumunu okumak.
   */
  it("dönemi durumdan çıkarmaz", () => {
    const allowed =
      /(PaymentStatus|CommissionLedgerStatus|BoostStatus|SubscriptionStatus|OfferStatus)\./;

    const offenders: string[] = [];
    for (const { file, source } of insightsSources()) {
      source.split("\n").forEach((line, index) => {
        if (!/\bstatus\b\s*[:=]/.test(line)) return;
        if (allowed.test(line)) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
