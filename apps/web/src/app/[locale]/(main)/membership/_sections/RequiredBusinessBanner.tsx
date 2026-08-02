/** @format */

"use client";

import Notice from "../_components/Notice";

/**
 * Shown when a company account must buy the business plan before continuing.
 *
 * Sadeleştirildi: 48px'lik renkli daire + ikon, çift kalınlıkta sarı çerçeve ve
 * ikinci bir uyarı ikonu kaldırıldı. Mesaj sayfanın en üstünde ve tek başına
 * duruyor; okunması için ek görsel ağırlığa ihtiyacı yok.
 */
export default function RequiredBusinessBanner() {
  return (
    <Notice title="Business Üyelik Gerekli">
      Şirket hesabınız için business üyelik almanız gerekmektedir. Üyeliğinizi
      tamamlamadan başka sayfalara geçemezsiniz. Lütfen aşağıdaki business
      üyelik planını seçip ödemeyi tamamlayın.
    </Notice>
  );
}
