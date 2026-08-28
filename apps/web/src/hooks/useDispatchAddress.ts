/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { isValidTrPhone } from "@tarodan/types";
import { addressesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

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
  isLoading: boolean;
}

/**
 * Satıcının kargo çıkış adresinin taşıyıcıya gönderilebilir olup olmadığı.
 *
 * Kargo v2 sözleşmesi GÖNDERİCİYİ zorunlu tutuyor: adresi ya da geçerli cep
 * numarası olmayan satıcının siparişinde koli hiç açılamıyor ve sipariş sessizce
 * kargosuz kalıyor (`buildParty` → `OrderShipmentProvisioner.createBarcode`).
 * Bu yüzden eksikliği satış anında değil, satıcı hâlâ ekrandayken yakalıyoruz.
 *
 * Seçim kuralı API ile BİREBİR aynı olmalı: varsayılan varsa o, yoksa ilk kayıt
 * (`addresses: { orderBy: { isDefault: "desc" }, take: 1 }`). Farklı seçersek
 * kapı "tamam" derken taşıyıcıya başka bir adres gider ve koli yine açılmaz.
 */
export function useDispatchAddress(enabled: boolean): DispatchAddressStatus {
  const query = useQuery({
    queryKey: queryKeys.addresses.all(),
    queryFn: async () => {
      const res = await addressesApi.getAll();
      return (res.data?.data || res.data || []) as DispatchAddressCandidate[];
    },
    enabled,
  });

  const dispatchAddress =
    query.data?.find((a) => a.isDefault) ?? query.data?.[0];
  const hasDispatchAddress =
    !!dispatchAddress &&
    !!dispatchAddress.address?.trim() &&
    !!dispatchAddress.city?.trim() &&
    !!dispatchAddress.district?.trim() &&
    isValidTrPhone(dispatchAddress.phone);

  return {
    hasDispatchAddress,
    needsFix: !!dispatchAddress && !hasDispatchAddress,
    isLoading: query.isLoading,
  };
}
