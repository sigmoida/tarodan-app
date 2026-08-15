/** @format */

import {
  BUYER_SELECTABLE_REFUND_REASONS,
  refundReasonConfig,
} from "@tarodan/ui";
import type { MessageKey } from "@tarodan/i18n";
import type { RefundReason } from "@/lib/api";
import { refundReasonLabelKey } from "@/app/[locale]/(main)/profile/(finance)/refund-requests/_lib/refund-status";

/**
 * Alıcının iade formunda seçebileceği nedenler: DEĞER listesi @tarodan/ui'deki
 * paylaşılan BUYER_SELECTABLE_REFUND_REASONS'tan türetilir (elle kopya listeler
 * sessizce kayıyordu), etiketler web'in next-intl anahtarlarından
 * (refund-status modülündeki tek eşlemeden) çözülür. Anahtarı olmayan yeni bir
 * enum değeri gelirse paylaşılan TR etiketi yedek olarak kullanılır.
 * Tekil iade modalı ile toplu iade modalı aynı listeyi paylaşır.
 */
export const buyerRefundReasonOptions = (
  t: (key: MessageKey) => string,
): Array<{ value: RefundReason; label: string }> =>
  BUYER_SELECTABLE_REFUND_REASONS.map((value) => {
    const labelKey = refundReasonLabelKey[value];
    return {
      value: value as RefundReason,
      label: t(labelKey ?? refundReasonConfig[value].labelKey),
    };
  });
