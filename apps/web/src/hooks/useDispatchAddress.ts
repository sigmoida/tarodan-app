/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { addressesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  evaluateDispatchAddress,
  type DispatchAddressCandidate,
  type DispatchAddressStatus,
} from "@/lib/dispatchAddress";

export interface DispatchAddressGate extends DispatchAddressStatus {
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
 * Seçim/geçerlilik kuralı `lib/dispatchAddress.ts`'te (API ile birebir).
 */
export function useDispatchAddress(enabled: boolean): DispatchAddressGate {
  const query = useQuery({
    queryKey: queryKeys.addresses.all(),
    queryFn: async () => {
      const res = await addressesApi.getAll();
      return (res.data?.data || res.data || []) as DispatchAddressCandidate[];
    },
    enabled,
  });

  return { ...evaluateDispatchAddress(query.data), isLoading: query.isLoading };
}
