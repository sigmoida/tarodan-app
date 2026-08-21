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
 * Whether a Sürat status indicates the shipment has been successfully delivered.
 */
export function isSuratDelivered(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi === 6 || kargonunDurumuSayi === 7;
}

/**
 * Whether a Sürat status indicates the shipment is in a return flow.
 */
export function isSuratReturnFlow(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi >= 9 && kargonunDurumuSayi <= 16;
}

/** `isSuratReturnCompleted`'in okuduğu alanlar — tam takip nesnesi gerekmez. */
export interface SuratReturnSignals {
  KargonunDurumuSayi: number;
  KargonunDurumu?: string | null;
  IadeDurum?: string | null;
  Hareketler?: { Islem?: string | null }[] | null;
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
