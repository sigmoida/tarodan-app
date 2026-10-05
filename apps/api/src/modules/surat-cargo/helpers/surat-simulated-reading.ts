import type { SuratTakipGonderi } from "./surat-cargo.types";

/**
 * UAT kargo simülasyonu için SENTETİK Sürat takip okuması.
 *
 * Staging'de koli taşıyıcıya hiç gitmez (sahte taşıyıcı ya da test şeridi), bu
 * yüzden poll onu asla ilerletmez. Test Araçları dış olayı (kabul, teslim) bu
 * okumayla taklit eder ve okumayı poll'un kullandığı AYNI uygulama çekirdeğine
 * verir — yorum (`interpretSuratTracking`), durum makinesi, teslim/escrow ve
 * bildirimler gerçekte olduğu gibi çalışır. Bu dosya yalnız okumanın
 * kendisini üretir; hiçbir kayda dokunmaz.
 *
 * Kodlar belgelenmiş tablodan seçildi ve yorumlayıcıda belirsizlik bırakmaz:
 *   1 → `picked_up` (şubede fiziksel kabul; ilk hareket)
 *   6 → `delivered` (IadeDurum "Hayır" — alıcıya teslim, iade değil)
 * İade dönüş kolisi Sürat'ta kendi başına bir İLERİ gönderidir; onun satıcıya
 * teslimi de 6 ile gelir (iade senkronu bunu `returned` olarak yazar).
 */

export const SIMULATED_CARRIER_STEPS = ["picked_up", "delivered"] as const;
export type SimulatedCarrierStep = (typeof SIMULATED_CARRIER_STEPS)[number];

/** Hareket satırına yazılan iz: zaman çizelgesinde simülasyonun kaynağı görünsün. */
export const SIMULATED_READING_NOTE = "UAT simülasyonu (Test Araçları)";

const STEP_READING: Record<
  SimulatedCarrierStep,
  { code: number; status: string; movement: string }
> = {
  picked_up: {
    code: 1,
    status: "Gönderi Kabul Edildi",
    movement: "Kargo Kabul",
  },
  delivered: { code: 6, status: "Teslim Edildi", movement: "Teslim Edildi" },
};

/** Türkiye saat dilimi (kalıcı UTC+3) — Sürat tarihleri ofsetsiz yerel saattir. */
const SURAT_LOCAL_OFFSET_MS = 3 * 3_600_000;

/**
 * Sürat'ın ofsetsiz yerel saat biçimi ("2026-10-05T13:04:05.000"); takip
 * istemcisinin `parseSuratDate`'i bunu +03:00 ile geri çözer, yani dönüş
 * kayıpsızdır.
 */
export function formatSuratLocalDate(at: Date): string {
  return new Date(at.getTime() + SURAT_LOCAL_OFFSET_MS)
    .toISOString()
    .replace("Z", "");
}

/**
 * Taşıyıcı kodu henüz yazılmamış koli için sahte kod. `SIM` öneki gerçek
 * Sürat kodlarıyla (ve test şeridinin `TEST`, stub'ın `STUB` önekleriyle)
 * karışmaz.
 */
export function simulatedCarrierCode(reference: string): string {
  return `SIM${reference.replace(/\D/g, "").slice(-10).padStart(10, "0")}`;
}

export function buildSimulatedSuratReading(input: {
  step: SimulatedCarrierStep;
  /** Kolinin taşıyıcı kodu (KargoTakipNo); yoksa `simulatedCarrierCode`. */
  carrierCode: string;
  at: Date;
}): SuratTakipGonderi {
  const { code, status, movement } = STEP_READING[input.step];
  const when = formatSuratLocalDate(input.at);
  const delivered = input.step === "delivered";
  return {
    KargoObjId: 0,
    EvrakTuru: "",
    SeriNo: "",
    SiraNo: 0,
    Evraktarihi: when,
    TesellumdenFaturaNo: null,
    // Boş: planlanan teslim tarihi yazılmaz (simülasyon tahmin üretmez).
    PlanlananTeslimTarihi: "",
    Satiskodu: "",
    ToplamAdet: 1,
    ParcaSiraSayi: "",
    // Sıfır tutar: taşıyıcı maliyet mutabakatı alanlarına hiçbir şey yazılmaz.
    ToplamDesiKg: 0,
    KdvTutar: 0,
    TutarKdvsiz: 0,
    Tutar: 0,
    CikisSubesi: "",
    CikisSubeTel: "",
    TeslimatSubesi: "",
    TeslimatSubeTel: "",
    KargoTakipNo: input.carrierCode,
    // Boş: takip URL'i sahte bir adresle doldurulmaz.
    TakipUrl: "",
    KargonunBulunduguYer: SIMULATED_READING_NOTE,
    SonHareketTarihi: when,
    KargonunDurumu: status,
    KargonunDurumuSayi: code,
    KargoHareketTip: null,
    DevirDurum: "",
    DevirSebebi: "",
    IadeDurum: "Hayır",
    IadeAciklama: "",
    TeslimTarihi: delivered ? when : "",
    TeslimAlan: delivered ? SIMULATED_READING_NOTE : "",
    Hareketler: [
      {
        HareketObjId: 0,
        IslemSubesi: 0,
        IslemSureci: null,
        Aciklama: SIMULATED_READING_NOTE,
        IslemTarihi: when,
        HareketYeri: SIMULATED_READING_NOTE,
        Islem: movement,
        KargoHareketKargonunDurumuSayi: String(code),
      },
    ],
  };
}
