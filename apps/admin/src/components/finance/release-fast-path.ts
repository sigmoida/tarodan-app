import toast from "react-hot-toast";

/**
 * Manuel escrow release yanıtının fast-path alanları — backend
 * `queueImmediatePayout`'un döndürdüğü sözleşme.
 */
export interface ReleaseFastPathResult {
  transferQueued?: boolean;
  transfersCreated?: number;
}

/**
 * Release sonrası fast-path akıbetini TEK yerden anlat (payouts modalı +
 * takas escrow paneli aynı sözleşmeyi paylaşır; iki kopya sessizce ayrışırdı):
 *
 *  - fiş atılamadı        → saatlik tarama devralacak (fallback),
 *  - fiş atıldı ama satır oluşmadı → engel var ya da satır zaten mevcut;
 *    "Transferler sekmesinde şimdi görürsün" vaadi YANLIŞ olurdu (deferred),
 *  - satır oluştu + fiş atıldı → saniyeler içinde işlenir (queued).
 *
 * Metinler çağırandan gelir (i18n `t` bileşende kalır — ReturnType<typeof
 * useTranslations> tuzağına girmeden).
 */
export function toastReleaseFastPath(
  res: ReleaseFastPathResult | undefined,
  messages: { queued: string; deferred: string; fallback: string },
): void {
  if (!res || typeof res.transferQueued === "undefined") return;
  if (res.transferQueued === false) {
    toast(messages.fallback);
  } else if ((res.transfersCreated ?? 0) === 0) {
    toast(messages.deferred);
  } else {
    toast.success(messages.queued);
  }
}
