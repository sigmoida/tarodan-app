import {
  decideReturnDropoffExpiry,
  hasCarrierMovement,
} from "./return-dropoff-expiry";
import type {
  SuratTakipGonderi,
  SuratTrackingLookupResult,
} from "../../surat-cargo/helpers/surat-cargo.types";

const gonderi = (over: Partial<SuratTakipGonderi>): SuratTakipGonderi =>
  ({
    Hareketler: [],
    KargonunDurumuSayi: 1,
    ...over,
  }) as SuratTakipGonderi;

const found = (
  over: Partial<SuratTakipGonderi>,
): SuratTrackingLookupResult => ({
  kind: "found",
  data: { IsError: false, errorMessage: null, Gonderiler: [gonderi(over)] },
});

describe("decideReturnDropoffExpiry", () => {
  it("Sürat'ta kayıt yoksa (pending) iptal eder — koli hiç şubeye götürülmemiş", () => {
    // CANLI HATA: bu dal eskiden `fetchTrackingInfo() === null` üzerinden
    // "belirsizlik" sayılıyordu; iptal edilmesi gereken tek vaka, iptali
    // engelleyen koşulun kendisiydi (RFD-M3Z95VHBCP / RFD-MCT8KZ644D, 31 gün).
    expect(
      decideReturnDropoffExpiry(
        { kind: "pending", message: "kargo kabul bekleniyor" },
        { hardOverdue: false },
      ),
    ).toEqual({ expire: true, reason: "no_carrier_record" });
  });

  it("etiket taşıyıcıda iptal edilmişse iptal eder", () => {
    expect(
      decideReturnDropoffExpiry(
        { kind: "cancelled", message: "Gönderi iptal edilmiştir." },
        { hardOverdue: false },
      ),
    ).toEqual({ expire: true, reason: "carrier_cancelled" });
  });

  it("kayıt var ama hiç hareket yoksa iptal eder", () => {
    expect(
      decideReturnDropoffExpiry(found({}), { hardOverdue: false }),
    ).toEqual({ expire: true, reason: "no_movement" });
  });

  it("pakette hareket varsa DOKUNMAZ — alıcı son anda götürmüş olabilir", () => {
    expect(
      decideReturnDropoffExpiry(found({ KargonunDurumuSayi: 4 }), {
        hardOverdue: true,
      }),
    ).toEqual({ expire: false, reason: "movement" });
  });

  it("sorgu hatasında (gerçek belirsizlik) atlar", () => {
    expect(
      decideReturnDropoffExpiry(
        { kind: "failure", category: "timeout", message: "timed out" },
        { hardOverdue: false },
      ),
    ).toEqual({ expire: false, reason: "unverifiable" });
  });

  it("arıza BİZDEYSE (kimlik yok) emniyet supabı dolsa bile iptal etmez", () => {
    // Kimlik rotasyonu fark edilmezse her sorgu düşer; hard timeout'a körlemesine
    // güvenmek şubeye GÖTÜRÜLMÜŞ iadeleri de toptan iptal ederdi.
    expect(
      decideReturnDropoffExpiry(
        {
          kind: "failure",
          category: "configuration",
          message: "SURAT_KARGO_CARI_KODU not configured",
        },
        { hardOverdue: true },
      ),
    ).toEqual({ expire: false, reason: "unverifiable" });
  });

  it("401/403 (yetki) de emniyet supabını çalıştırmaz", () => {
    expect(
      decideReturnDropoffExpiry(
        {
          kind: "failure",
          category: "http",
          httpStatus: 401,
          message: "Surat tracking API HTTP 401",
        },
        { hardOverdue: true },
      ),
    ).toEqual({ expire: false, reason: "unverifiable" });
  });

  it("sorgu hatası sürse bile emniyet supabı dolunca iptal eder", () => {
    expect(
      decideReturnDropoffExpiry(
        { kind: "failure", category: "network", message: "ECONNRESET" },
        { hardOverdue: true },
      ),
    ).toEqual({ expire: true, reason: "unverifiable_hard_timeout" });
  });
});

describe("hasCarrierMovement", () => {
  it("kayıt yoksa hareket yok", () => {
    expect(hasCarrierMovement(undefined)).toBe(false);
  });

  it("yalnız evrak oluşturulmuşsa (durum 1, hareket yok) hareket yok", () => {
    expect(hasCarrierMovement(gonderi({}))).toBe(false);
  });

  it("hareket listesi doluysa hareket var", () => {
    expect(hasCarrierMovement(gonderi({ Hareketler: [{} as any] }))).toBe(true);
  });

  it("durum kodu 2+ ise hareket var", () => {
    expect(hasCarrierMovement(gonderi({ KargonunDurumuSayi: 2 }))).toBe(true);
  });
});
