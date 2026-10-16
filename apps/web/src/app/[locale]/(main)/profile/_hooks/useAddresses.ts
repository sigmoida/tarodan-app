/** @format */

"use client";

import toast from "react-hot-toast";
import { addressesApi } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import { queryKeys } from "@/lib/query/keys";
import type { AddressValues } from "../_lib/schemas";

export interface Address extends AddressValues {
  id: string;
}

const RESOURCE = "profile-addresses";
// Aynı adresler başka anahtarlarla da okunuyor: ilan formu kapısı
// (`useDispatchAddress`) ve ödeme adım listesi. Yazma onları da bayatlatmalı,
// yoksa 1 dk boyunca eski liste / "adres yok" görünür.
const INVALIDATES = [
  RESOURCE,
  queryKeys.addresses.all()[0],
  queryKeys.checkout.addresses()[0],
];

export function useAddresses(enabled: boolean) {
  const query = useWebList<Address[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await addressesApi.getAll();
      return res.data.data || res.data || [];
    },
    enabled,
    query: { meta: { page: "profile-addresses" } },
  });
  return { addresses: query.data ?? [], isLoading: query.isLoading };
}

/** Create or update an address (update when `id` is passed). */
export function useSaveAddress() {
  const t = useTranslations();
  return useWebMutation(
    async ({ id, values }: { id: string | null; values: AddressValues }) => {
      const payload = { ...values, title: values.title?.trim() || "Ev" };
      if (id) await addressesApi.update(id, payload);
      else await addressesApi.create(payload);
      return !!id;
    },
    {
      invalidates: INVALIDATES,
      errorMessage: t("address.saveFailed"),
      onSuccess: (wasUpdate) =>
        toast.success(wasUpdate ? t("address.updated") : t("address.added")),
    },
  );
}

export function useDeleteAddress() {
  const t = useTranslations();
  return useWebMutation((id: string) => addressesApi.delete(id), {
    invalidates: INVALIDATES,
    successMessage: t("address.deleted"),
    errorMessage: t("address.deleteFailed"),
  });
}

export function useSetDefaultAddress() {
  const t = useTranslations();
  return useWebMutation((id: string) => addressesApi.setDefault(id), {
    invalidates: INVALIDATES,
    successMessage: t("address.defaultUpdated"),
    errorMessage: t("address.defaultFailed"),
  });
}
