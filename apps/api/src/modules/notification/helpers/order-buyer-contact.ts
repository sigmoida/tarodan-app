import { SYSTEM_GUEST_EMAIL } from "../../elogo/invoice/elogo-guest-recipient";

const SYSTEM_GUEST_NAME = "GUEST_SYSTEM";

/** Alıcıya giden sipariş e-postasının adresi ve hitabı. */
export interface OrderBuyerContact {
  /** Gönderilecek adres; ulaşılabilir bir adres yoksa null (gönderilmez). */
  email: string | null;
  /** Selamlamadaki ad; bilinmiyorsa boş (şablon genel hitaba düşer). */
  name: string;
  /** Misafir siparişi mi — şablon "siparişi gör" linkini buna göre kurar. */
  isGuest: boolean;
}

const text = (value: unknown): string | undefined => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Siparişin alıcısına e-posta nereye gider — TEK kural.
 *
 * Misafir siparişleri ortak sistem kullanıcısını (`guest@tarodan.system`,
 * "GUEST_SYSTEM") paylaşır; gerçek alıcı siparişin teslimat verisindedir
 * (`shippingAddress.guestEmail` / `guestName`, eski kayıtta `email` /
 * `fullName`). Kullanıcı kaydına gönderilen e-posta sistem adresine gidiyor,
 * misafir iptal/iade/gecikme haberini hiç almıyordu. Ödeme onayı e-postası
 * (fulfillment) aynı alanları okur.
 *
 * Sistem adresi hiçbir zaman alıcı sayılmaz: misafirin adresi yoksa `null`.
 */
export function orderBuyerContact(order: {
  buyer: { email: string | null; displayName?: string | null } | null;
  shippingAddress: unknown;
}): OrderBuyerContact {
  const address =
    order.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as Record<string, unknown>)
      : {};
  const accountEmail = text(order.buyer?.email);
  const isGuest =
    address.isGuestOrder === true ||
    accountEmail?.toLowerCase() === SYSTEM_GUEST_EMAIL;

  if (!isGuest) {
    return {
      email: accountEmail ?? null,
      name: text(order.buyer?.displayName) ?? "",
      isGuest: false,
    };
  }

  const guestEmail = text(address.guestEmail) ?? text(address.email);
  const guestName = text(address.guestName) ?? text(address.fullName);
  return {
    email:
      guestEmail && guestEmail.toLowerCase() !== SYSTEM_GUEST_EMAIL
        ? guestEmail
        : null,
    name: guestName && guestName !== SYSTEM_GUEST_NAME ? guestName : "",
    isGuest: true,
  };
}
