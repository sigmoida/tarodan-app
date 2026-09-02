import { ShipmentStatus } from "@prisma/client";

/**
 * Maps Sürat Kargo KargonunDurumuSayi (1-16) to our ShipmentStatus enum.
 * Based on official Sürat Kargo API documentation (2024).
 *
 * Sürat statuses:
 *  1  = Gönderi Hazırlanıyor
 *  2  = Transfer Merkezinde
 *  3  = Gönderi Yolda
 *  4  = Teslimat Şubesinde
 *  5  = Kurye Dağıtımda
 *  6  = Teslim Edildi
 *  7  = MGT Teslim Edildi
 *  8  = Yönlendirme Sürecinde
 *  9  = İade Sürecinde
 *  10 = İade Gönderi Hazırlanıyor
 *  11 = İade Transfer Merkezinde
 *  12 = İade Teslim Edildi
 *  13 = İade Gönderi Yolda
 *  14 = İade Teslimat Şubesinde
 *  15 = İade Kurye Dağıtımda
 *  16 = İade Yönlendirme Sürecinde
 */
const SURAT_STATUS_MAP: Record<number, ShipmentStatus> = {
  // Takip ucunda kod 1'in görünmesi, önceki "kargo kabul bekleniyor" cevabının
  // bittiği ve paketin şubede fiziksel kabul edildiği anlamına gelir.
  1: ShipmentStatus.picked_up,
  2: ShipmentStatus.in_transit,
  3: ShipmentStatus.in_transit,
  4: ShipmentStatus.at_delivery_branch,
  5: ShipmentStatus.out_for_delivery,
  6: ShipmentStatus.delivered,
  7: ShipmentStatus.delivered,
  8: ShipmentStatus.in_transit,
  9: ShipmentStatus.return_in_progress,
  10: ShipmentStatus.return_in_progress,
  11: ShipmentStatus.return_in_progress,
  12: ShipmentStatus.returned,
  13: ShipmentStatus.return_in_progress,
  14: ShipmentStatus.return_in_progress,
  15: ShipmentStatus.return_in_progress,
  16: ShipmentStatus.return_in_progress,
};

/**
 * L2: bilinmeyen kod `null` döner — eskiden körlemesine `in_transit`'e düşüyordu
 * ve yanlış aksiyon durumu üretiyordu. Çağıran taraf null'da statüyü DEĞİŞTİRMEZ
 * (ham kod yine providerStatusCode/providerRawStatus'a kaydedilir) ve warn loglar.
 */
export function mapSuratStatusToShipmentStatus(
  kargonunDurumuSayi: number,
): ShipmentStatus | null {
  return SURAT_STATUS_MAP[kargonunDurumuSayi] ?? null;
}

/**
 * Whether a Sürat status CODE is a delivery code. Tek başına "alıcıya teslim"
 * kanıtı DEĞİLDİR — iade bayrağıyla birlikte okunmalı; karar `interpretSuratTracking`'te.
 */
export function isSuratDelivered(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi === 6 || kargonunDurumuSayi === 7;
}

/**
 * Whether a Sürat status CODE sits in the documented return range. Canlıda bu
 * aralık gerçek iade olmadan da geliyor (aşağıya bak); tek başına karar için
 * kullanma, `interpretSuratTracking().isReturnFlow`'a bak.
 */
export function isSuratReturnFlow(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi >= 9 && kargonunDurumuSayi <= 16;
}

/** `isSuratReturnCompleted`'in okuduğu alanlar — tam takip nesnesi gerekmez. */
export interface SuratReturnSignals {
  KargonunDurumuSayi: number;
  KargonunDurumu?: string | null;
  IadeDurum?: string | null;
  Hareketler?:
    | {
        Islem?: string | null;
        IslemTarihi?: string | null;
        KargoHareketKargonunDurumuSayi?: string | number | null;
      }[]
    | null;
}

/**
 * Türkçe-güvenli küçültme.
 *
 * `"İade".toLowerCase()` JavaScript'te `"i" + U+0307` (birleşik nokta) üretir,
 * `/iade/i` bununla EŞLEŞMEZ. Sürat'ın metinleri tam da bu harfle başlıyor
 * ("İade Edildi", "Teslim Edildi (İade)"), yani düz regex sessizce hep false
 * dönerdi. Noktalı/noktasız İ-I-ı ailesini önce sade `i`'ye indiriyoruz.
 */
function normalizeTr(value?: string | null): string {
  return (value ?? "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/\u0307/g, "");
}

/** "Evet" / "evet" — Sürat'ın iade bayrağı. */
function isReturnFlagged(iadeDurum?: string | null): boolean {
  return normalizeTr(iadeDurum).trim() === "evet";
}

/**
 * İadenin GÖNDERENE teslim edilmesiyle tamamlandığı.
 *
 * Tek koda güvenmiyoruz. Doküman `12 = İade Teslim Edildi` diyor, ama canlıda
 * tamamlanmış bir iade `KargonunDurumuSayi: 13` + `KargonunDurumu:
 * "Teslim Edildi (İade)"` + `IadeDurum: "Evet"` + son hareket `"İade Edildi"`
 * olarak döndü — ve dokümanda 13'ün karşılığı "İade Gönderi Yolda". Yalnız 12'ye
 * bakan eski sürüm bu gönderiyi sonsuza kadar "iade sürecinde" bırakıyordu.
 *
 * 13'ü TEK BAŞINA tamamlanma saymıyoruz: doküman ona "yolda" diyorsa ve
 * yanılırsak satıcı ürünü almadan alıcıya para iade ederiz. Bunun yerine açık
 * tamamlanma sinyali arıyoruz — "İade Edildi" hareketi ya da durum metninde
 * hem iade hem teslim geçmesi. İkisi de hem dokümanla hem canlıyla tutarlı ve
 * kod tablosundaki belirsizlikten bağımsız.
 */
export function isSuratReturnCompleted(gonderi: SuratReturnSignals): boolean {
  // Dokümante edilmiş kesin kod; bayrak aranmadan kabul.
  if (gonderi.KargonunDurumuSayi === 12) return true;
  if (!isReturnFlagged(gonderi.IadeDurum)) return false;

  const durum = normalizeTr(gonderi.KargonunDurumu);
  if (/iade/.test(durum) && /teslim\s*edildi/.test(durum)) return true;

  return (gonderi.Hareketler ?? []).some((h) =>
    /iade\s*edildi/.test(normalizeTr(h?.Islem)),
  );
}

/** `interpretSuratTracking`'in tek çıktısı — üç senkron servisi de bunu okur. */
export interface SuratTrackingInterpretation {
  /** Yerel statü hedefi; `null` = statüyü DEĞİŞTİRME (bilinmeyen ya da belirsiz). */
  status: ShipmentStatus | null;
  /** Alıcıya teslim (escrow/teslim işleyicisini tetikler). */
  isDelivered: boolean;
  /** Koli gerçekten iade akışında (bayrak "Evet" ya da tamamlanmış iade). */
  isReturnFlow: boolean;
  /** İade göndericiye geri teslim edildi. */
  isReturnCompleted: boolean;
}

/**
 * En son hareketin taşıdığı kod (Sürat string döner); parse edilemezse null.
 * Sürat listeyi yeniden-eskiye veriyor ama sıraya güvenmek yerine tarihe bakılır
 * (ISO benzeri "2026-09-02T10:57:12.000" metni sözlük sırasıyla karşılaştırılabilir).
 */
function latestMovementCode(gonderi: SuratReturnSignals): number | null {
  const movements = gonderi.Hareketler ?? [];
  let latest: (typeof movements)[number] | undefined;
  for (const h of movements) {
    if (!latest) {
      latest = h;
      continue;
    }
    if ((h?.IslemTarihi ?? "") > (latest.IslemTarihi ?? "")) latest = h;
  }
  const raw = latest?.KargoHareketKargonunDurumuSayi;
  if (raw === null || raw === undefined || raw === "") return null;
  const code = Number(raw);
  return Number.isInteger(code) ? code : null;
}

/**
 * Sürat takip cevabını yerel karara çeviren TEK yer.
 *
 * Kod tablosu (1–16) tek başına güvenilir değil; canlıda iki kez yanıldı:
 *  - Tamamlanmış iade dokümandaki 12 yerine 13 ("İade Gönderi Yolda") ile geldi.
 *  - Normal bir teslimat, koli daha şubedeyken 9 ("İade Sürecinde") gösterdi;
 *    `IadeDurum: "Hayır"`, hareketler sıradan yükleme kayıtlarıydı ve ertesi
 *    gün 6 ile teslim edildi (PKG-2HGNFGEGTD, 2026-09-01). Kodu sorgusuz
 *    kabul eden eski mapper koliyi `return_in_progress`'e düşürdü; durum
 *    makinesi oradan teslime geçişi yasakladığı için koli sonsuza dek kilitlendi,
 *    sipariş "hazırlanıyor"da kaldı ve satıcı ödemesi hiç başlamadı.
 *
 * Bu yüzden iade kararı KOD'a değil Sürat'ın iade BAYRAĞINA (`IadeDurum`) ve
 * tamamlanma sinyallerine bağlanır; kod yalnız akış içindeki konumu söyler.
 */
export function interpretSuratTracking(
  gonderi: SuratReturnSignals,
): SuratTrackingInterpretation {
  const code = gonderi.KargonunDurumuSayi;
  const flagged = isReturnFlagged(gonderi.IadeDurum);

  if (isSuratReturnCompleted(gonderi)) {
    return {
      status: ShipmentStatus.returned,
      isDelivered: false,
      isReturnFlow: true,
      isReturnCompleted: true,
    };
  }

  if (isSuratDelivered(code)) {
    // İade bayraklı "teslim" ama tamamlanma sinyali yok: alıcıya mı, göndericiye
    // mi teslim belli değil. Alıcıya sayıp escrow'u satıcıya açmak para hatası
    // olur; göndericiye sayıp alıcıya para iade etmek de öyle. Dokunma, uyar.
    if (flagged) {
      return {
        status: null,
        isDelivered: false,
        isReturnFlow: true,
        isReturnCompleted: false,
      };
    }
    return {
      status: ShipmentStatus.delivered,
      isDelivered: true,
      isReturnFlow: false,
      isReturnCompleted: false,
    };
  }

  if (isSuratReturnFlow(code)) {
    if (flagged) {
      return {
        status: ShipmentStatus.return_in_progress,
        isDelivered: false,
        isReturnFlow: true,
        isReturnCompleted: false,
      };
    }
    // Bayraksız iade kodu = iade DEĞİL. Konumu son hareketin kodundan türet;
    // hareket kodu da iade aralığındaysa ya da yoksa statüye dokunma.
    const movementCode = latestMovementCode(gonderi);
    const status =
      movementCode !== null &&
      !isSuratReturnFlow(movementCode) &&
      !isSuratDelivered(movementCode)
        ? mapSuratStatusToShipmentStatus(movementCode)
        : null;
    return {
      status,
      isDelivered: false,
      isReturnFlow: false,
      isReturnCompleted: false,
    };
  }

  return {
    status: mapSuratStatusToShipmentStatus(code),
    isDelivered: false,
    isReturnFlow: false,
    isReturnCompleted: false,
  };
}
