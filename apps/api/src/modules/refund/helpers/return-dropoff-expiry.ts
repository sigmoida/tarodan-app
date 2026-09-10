import type {
  SuratTakipGonderi,
  SuratTrackingLookupResult,
} from "../../surat-cargo/helpers/surat-cargo.types";

/**
 * D25 süre-aşımı kararının TEK mercii. Servisten ayrı durmasının sebebi tarihsel:
 * karar `fetchTrackingInfo()` null'ı üzerinden veriliyordu ve `null` iki AYRI
 * gerçeği aynı kefeye koyuyordu — "Sürat'ta kayıt yok" (koli hiç şubeye
 * götürülmedi → iptal edilecek tam vaka) ile "Sürat'a soramadık" (belirsizlik →
 * dokunma). İkisi birleşince iptal edilmesi gereken kayıt, iptali engelleyen
 * koşulun ta kendisini üretiyordu: hiç götürülmemiş iade sonsuza dek
 * `return_shipment_open`'da kalıyor, satıcının hold'u donuk kalıyor, sipariş
 * kapanmıyordu (canlıda RFD-M3Z95VHBCP ve RFD-MCT8KZ644D, 31 gün).
 */
export type DropoffExpiryDecision =
  | {
      expire: true;
      /** Neden iptal edildiği — history/audit'e aynen yazılır. */
      reason:
        | "no_carrier_record"
        | "carrier_cancelled"
        | "no_movement"
        | "unverifiable_hard_timeout";
    }
  | { expire: false; reason: "movement" | "unverifiable" };

/**
 * Koli fiziksel olarak yola çıkmış mı? Sürat, ön bildirimi alınmış ama şubede
 * kabul edilmemiş gönderiye de bir kayıt döndürebildiği için hem hareket listesi
 * hem durum kodu okunur; 1 = "evrak oluşturuldu" (henüz kabul yok).
 */
export function hasCarrierMovement(
  gonderi: SuratTakipGonderi | undefined,
): boolean {
  if (!gonderi) return false;
  return (
    (gonderi.Hareketler?.length ?? 0) > 0 ||
    (gonderi.KargonunDurumuSayi ?? 1) >= 2
  );
}

/** Sorgunun bizim yapılandırma/yetki arızamızdan düşüp düşmediği. */
function isSelfInflictedFailure(
  lookup: Extract<SuratTrackingLookupResult, { kind: "failure" }>,
): boolean {
  return (
    lookup.category === "configuration" ||
    (lookup.category === "http" &&
      (lookup.httpStatus === 401 || lookup.httpStatus === 403))
  );
}

/**
 * Takip sorgusunun sonucunu süre-aşımı kararına çevirir.
 *
 * - `pending`  → Sürat "kargo kabul bekleniyor" diyor: ön bildirim var, koli yok.
 *                Süre dolduysa iptal edilecek vakanın TA KENDİSİ.
 * - `cancelled`→ etiket taşıyıcıda iptal: hareket artık imkânsız, terminal.
 * - `found`    → hareket varsa dokunma (alıcı son anda götürmüş olabilir),
 *                yoksa iptal et.
 * - `failure`  → gerçek belirsizlik (http/timeout/network/config/parse): kural
 *                olarak dokunma; ancak `hardOverdue` ise para süresiz donuk
 *                kalmasın diye yine de kapat (emniyet supabı). İSTİSNA: hata
 *                bizim tarafımızdaysa (kimlik yok / 401 / 403) emniyet supabı
 *                da çalışmaz — yoksa bir kimlik rotasyonu 21 gün fark
 *                edilmediğinde şubeye GÖTÜRÜLMÜŞ iadeler de toptan iptal
 *                edilir ve alıcı hem ürünü hem parayı kaybeder. Bu vaka
 *                kapatılacak bir "takılı iade" değil, düzeltilecek bir
 *                yapılandırma arızasıdır.
 */

export function decideReturnDropoffExpiry(
  lookup: SuratTrackingLookupResult,
  opts: { hardOverdue: boolean },
): DropoffExpiryDecision {
  switch (lookup.kind) {
    case "found":
      return hasCarrierMovement(lookup.data.Gonderiler?.[0])
        ? { expire: false, reason: "movement" }
        : { expire: true, reason: "no_movement" };
    case "pending":
      return { expire: true, reason: "no_carrier_record" };
    case "cancelled":
      return { expire: true, reason: "carrier_cancelled" };
    case "failure":
      return opts.hardOverdue && !isSelfInflictedFailure(lookup)
        ? { expire: true, reason: "unverifiable_hard_timeout" }
        : { expire: false, reason: "unverifiable" };
  }
}
