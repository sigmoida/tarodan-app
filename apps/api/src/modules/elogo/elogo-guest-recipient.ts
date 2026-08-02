/** Tüm misafir siparişlerinin paylaştığı sistem kullanıcısı. */
export const SYSTEM_GUEST_EMAIL = "guest@tarodan.system";
const SYSTEM_GUEST_NAME = "GUEST_SYSTEM";

export interface GuestInvoiceRecipient {
  name: string;
  email?: string;
  address?: {
    city?: string | null;
    district?: string | null;
    street?: string | null;
    zipCode?: string | null;
  };
}

/**
 * Misafir siparişinin GERÇEK fatura alıcısını `order.shippingAddress` JSON'undan
 * çıkarır.
 *
 * Neden gerekli: misafir checkout'ları tek sistem kullanıcısını paylaşır, bu yüzden
 * alıcıyı kullanıcı kaydından okumak faturayı "GUEST_SYSTEM" adına ve sistem
 * e-postasına kesiyordu — nihai tüketici (11111111111) yolu bile gerçek adı
 * gerektirir ve müşteri zorunlu e-Arşiv kopyasını hiç almıyordu.
 *
 * @returns kullanılabilir bir kimlik yoksa `null` (çağıran mevcut davranışa düşer)
 */
export function resolveGuestInvoiceRecipient(
  shippingAddress: unknown,
): GuestInvoiceRecipient | null {
  if (!shippingAddress || typeof shippingAddress !== "object") return null;
  const data = shippingAddress as Record<string, unknown>;

  const text = (value: unknown): string | undefined => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const rawName = text(data.guestName) ?? text(data.fullName);
  // Yer tutucu adı fatura alıcısı olarak kabul etme.
  const name = rawName && rawName !== SYSTEM_GUEST_NAME ? rawName : undefined;
  if (!name) return null;

  const rawEmail = text(data.guestEmail);
  const email =
    rawEmail && rawEmail.toLowerCase() !== SYSTEM_GUEST_EMAIL
      ? rawEmail
      : undefined;

  return {
    name,
    email,
    address: {
      city: text(data.city) ?? null,
      district: text(data.district) ?? null,
      street: text(data.address) ?? null,
      zipCode: text(data.zipCode) ?? null,
    },
  };
}
