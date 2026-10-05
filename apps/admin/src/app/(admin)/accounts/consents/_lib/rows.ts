import {
  ADMIN_ORDERS_DEFAULT_SCREEN_TAB,
  type AdminConsentRecordRow,
} from "@tarodan/types";
import type { TranslateFn } from "@/components/list/filters/types";
import { ordersTabHref } from "@/app/(admin)/operations/orders/_lib/screenTabs";

/**
 * Onayın sahibi hücresi. Üye → kullanıcı dosyası; misafir alıcı → e-posta;
 * giriş yapmamış ziyaretçi → ziyaretçi kimliği (çerez kaydı).
 */
export function consentSubject(t: TranslateFn, row: AdminConsentRecordRow) {
  if (row.user) {
    return {
      name: row.user.displayName,
      secondary: row.user.email,
      tertiary: row.user.adminCode,
      href: `/accounts/users/${row.user.id}`,
    };
  }
  if (row.guestEmail) {
    return {
      name: row.guestEmail,
      secondary: t("admin.consents.subjects.guest"),
    };
  }
  return {
    name: t("admin.consents.subjects.visitor"),
    secondary: row.visitorId ?? undefined,
  };
}

/**
 * Mesafeli satış onayının ait olduğu satın alma. Tekil (teklif) siparişin
 * dosyası var; sepetin ayrı bir dosyası yok — Siparişler ekranı sepet
 * numarasıyla aranır.
 */
export function consentReference(
  row: AdminConsentRecordRow,
): { href: string; label: string } | null {
  if (row.order) {
    return {
      href: `/operations/orders/${row.order.id}`,
      label: row.order.orderNumber,
    };
  }
  if (row.checkoutGroup) {
    return {
      href: ordersTabHref(ADMIN_ORDERS_DEFAULT_SCREEN_TAB, {
        q: row.checkoutGroup.groupNumber,
      }),
      label: row.checkoutGroup.groupNumber,
    };
  }
  return null;
}
