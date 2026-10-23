/** @format */

"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { discountsApi, userApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Discount, DiscountFormData, SellerProduct } from "../_lib/types";
import { buildPayload } from "../_lib/payload";

const RESOURCE = "profile-discounts";
const PRODUCTS_RESOURCE = "profile-discounts-products";

/**
 * All of the seller's discounts (unfiltered). Metrics AND the filtered list both
 * derive from this single dataset, so switching tabs never refetches or moves
 * the metric cards.
 */
export function useDiscounts(enabled: boolean) {
  const query = useWebList<Discount[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await discountsApi.getAll({ limit: 100 });
      const data = res.data;
      return data.items || data || [];
    },
    enabled,
    query: { meta: { page: "profile-discounts" } },
  });
  return { discounts: query.data ?? [], isLoading: query.isLoading };
}

/** Active products for the discount form's product picker. */
export function useSellerProducts(enabled: boolean) {
  const query = useWebList<SellerProduct[]>({
    resource: PRODUCTS_RESOURCE,
    fetcher: async () => {
      const res = await userApi.getMyProducts({ limit: 100, status: "active" });
      const data = res.data;
      const items: SellerProduct[] = data.data || data.products || data || [];
      return items.filter((p) => p.status === "active");
    },
    enabled,
    query: { meta: { page: "profile-discounts-products" } },
  });
  return query.data ?? [];
}

/** Create or update a discount (update when `id` is passed). */
export function useSaveDiscount() {
  const t = useTranslations();
  return useWebMutation(
    async ({ id, form }: { id: string | null; form: DiscountFormData }) => {
      const payload = buildPayload(form);
      if (id) await discountsApi.update(id, payload);
      else await discountsApi.create(payload as any);
      return !!id;
    },
    {
      invalidates: [RESOURCE],
      errorMessage: t("seller.discounts.saveFailed"),
      onSuccess: (wasUpdate) =>
        toast.success(
          wasUpdate
            ? t("seller.discounts.updated")
            : t("seller.discounts.created"),
        ),
    },
  );
}

export function useDeleteDiscount() {
  const t = useTranslations();
  return useWebMutation((id: string) => discountsApi.delete(id), {
    invalidates: [RESOURCE],
    successMessage: t("seller.discounts.deleted"),
    errorMessage: t("seller.discounts.deleteFailed"),
  });
}

export function useToggleDiscount() {
  const t = useTranslations();
  return useWebMutation(
    (discount: Discount) =>
      discountsApi.update(discount.id, { isActive: !discount.isActive }),
    {
      invalidates: [RESOURCE],
      errorMessage: t("seller.discounts.statusUpdateFailed"),
      onSuccess: (_res, discount) =>
        toast.success(
          discount.isActive
            ? t("seller.discounts.disabled")
            : t("seller.discounts.enabled"),
        ),
    },
  );
}
