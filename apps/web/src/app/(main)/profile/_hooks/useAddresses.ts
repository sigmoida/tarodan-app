/** @format */

"use client";

import toast from "react-hot-toast";
import { addressesApi } from "@/lib/api";
import { useTranslation } from "@/i18n";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { AddressValues } from "../_lib/schemas";

export interface Address extends AddressValues {
  id: string;
}

const RESOURCE = "profile-addresses";

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
  const { t } = useTranslation();
  return useWebMutation(
    async ({ id, values }: { id: string | null; values: AddressValues }) => {
      const payload = { ...values, title: values.title?.trim() || "Ev" };
      if (id) await addressesApi.update(id, payload);
      else await addressesApi.create(payload);
      return !!id;
    },
    {
      invalidates: [RESOURCE],
      errorMessage: t("address.saveFailed"),
      onSuccess: (wasUpdate) =>
        toast.success(wasUpdate ? t("address.updated") : t("address.added")),
    },
  );
}

export function useDeleteAddress() {
  const { t } = useTranslation();
  return useWebMutation((id: string) => addressesApi.delete(id), {
    invalidates: [RESOURCE],
    successMessage: t("address.deleted"),
    errorMessage: t("address.deleteFailed"),
  });
}

export function useSetDefaultAddress() {
  const { t } = useTranslation();
  return useWebMutation((id: string) => addressesApi.setDefault(id), {
    invalidates: [RESOURCE],
    successMessage: t("address.defaultUpdated"),
    errorMessage: t("address.defaultFailed"),
  });
}
