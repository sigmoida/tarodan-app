import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "@/i18n/navigation";
import { useMutation } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { listingsApi, api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { EditListingValues } from "@tarodan/listing-form";

interface UseListingLifecycleParams {
  id: string;
  form: UseFormReturn<EditListingValues>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
}

export function useListingLifecycle({
  id,
  form,
  setIsLoading,
}: UseListingLifecycleParams) {
  const t = useTranslations();
  const router = useRouter();
  const { refreshUserData } = useAuthStore();

  const [reactivateQuantity, setReactivateQuantity] = useState("1");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const status = form.watch("status");
  const quantity = form.watch("quantity");

  // Sync reactivateQuantity with actual product quantity when sold/inactive (so "Yeniden Satışa Aç" shows real stock)
  useEffect(() => {
    if (
      (status === "sold" || status === "inactive") &&
      quantity !== undefined &&
      quantity !== null &&
      quantity !== ""
    ) {
      setReactivateQuantity(String(quantity));
    }
  }, [status, quantity]);

  const reactivateMutation = useMutation({
    mutationFn: (qty: number) =>
      listingsApi.update(id, { status: "active", quantity: qty } as any),
    onSuccess: () => {
      toast.success(t("product.sentForReviewRepublish"));
      router.push("/profile/listings");
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || t("product.reactivateFailed"),
      );
    },
  });

  const handleReactivate = () => {
    const qty = Number(reactivateQuantity);
    if (!qty || qty < 1) {
      toast.error(t("product.invalidStockQuantity"));
      return;
    }
    reactivateMutation.mutate(qty);
  };

  const deactivateMutation = useMutation({
    mutationFn: () => listingsApi.update(id, { status: "inactive" } as any),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: () => {
      form.setValue("status", "inactive");
      toast.success(t("product.listingDeactivated"));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t("common.operationFailed"));
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleDeactivate = () => deactivateMutation.mutate();

  // Satıcı doğrudan aktifleştiremez: istek admin onayına (pending) gider.
  const activateMutation = useMutation({
    mutationFn: () => listingsApi.update(id, { status: "active" } as any),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: () => {
      form.setValue("status", "pending");
      toast.success(t("product.sentForReview"));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t("common.operationFailed"));
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleActivate = () => activateMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: async () => {
      toast.success(t("product.listingRemoved"));
      // Refresh user data to update listing count
      await refreshUserData();
      // Small delay to ensure backend has processed the deletion
      await new Promise((resolve) => setTimeout(resolve, 500));
      router.push("/profile/listings");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t("product.deleteFailed"));
    },
    onSettled: () => {
      setIsLoading(false);
      setShowDeleteModal(false);
    },
  });

  const handleDelete = () => deleteMutation.mutate();

  const reactivating = reactivateMutation.isPending;

  return {
    reactivateQuantity,
    setReactivateQuantity,
    reactivating,
    showDeleteModal,
    setShowDeleteModal,
    handleReactivate,
    handleDeactivate,
    handleActivate,
    handleDelete,
  };
}
