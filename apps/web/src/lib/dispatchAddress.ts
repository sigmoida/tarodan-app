/** @format */

import { isValidTrPhone } from "@tarodan/types";

/** Kargo çıkış adresi kapısı için gereken alanlar — tam adres modeli değil. */
export interface DispatchAddressCandidate {
  id: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  isDefault?: boolean;
}

export interface DispatchAddressStatus {
  /** Taşıyıcıya gönderilebilecek geçerli bir çıkış adresi var mı. */
  hasDispatchAddress: boolean;
  /** Kayıt VAR ama taşıyıcı için kullanılamaz — "ekle" değil "düzelt" denmeli. */
  needsFix: boolean;
}

/**
 * Çıkış adresi kuralı — TEK kaynak (ilan formu kapısı, giriş hatırlatması ve
 * profil kaydı sonrası "kapı açıldı mı" kontrolü hep bunu kullanır).
 *
 * Seçim kuralı API ile BİREBİR aynı olmalı: varsayılan varsa o, yoksa ilk kayıt
 * (`addresses: { orderBy: { isDefault: "desc" }, take: 1 }`). Farklı seçersek
 * kapı "tamam" derken taşıyıcıya başka bir adres gider ve koli yine açılmaz.
 */
export function evaluateDispatchAddress(
  addresses: readonly DispatchAddressCandidate[] | null | undefined,
): DispatchAddressStatus {
  const dispatchAddress = addresses?.find((a) => a.isDefault) ?? addresses?.[0];
  const hasDispatchAddress =
    !!dispatchAddress &&
    !!dispatchAddress.address?.trim() &&
    !!dispatchAddress.city?.trim() &&
    !!dispatchAddress.district?.trim() &&
    isValidTrPhone(dispatchAddress.phone);
  return {
    hasDispatchAddress,
    needsFix: !!dispatchAddress && !hasDispatchAddress,
  };
}
