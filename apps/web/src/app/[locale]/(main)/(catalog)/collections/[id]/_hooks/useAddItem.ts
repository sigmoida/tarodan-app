/** @format */

"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collectionsApi } from "@/lib/api";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import { useMyProducts } from "./useMyProducts";

/** Products tab of the add-item modal: pick own listings and batch-add them.
 *  The custom-item tab is a self-contained form (see CustomItemForm). */
export function useAddItem() {
  const { t, collection, showAddModal, setShowAddModal, invalidateCollection } =
    useCollectionDetail();

  const [activeTab, setActiveTab] = useState<"products" | "custom">("products");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const existingProductIds = useMemo(
    () =>
      new Set(
        (collection?.items || [])
          .map((item) => item.productId)
          .filter((id): id is string => !!id),
      ),
    [collection?.items],
  );
  const {
    products,
    isLoading: loadingProducts,
    refetch: refetchProducts,
  } = useMyProducts(
    showAddModal && activeTab === "products",
    existingProductIds,
  );

  const close = () => {
    setShowAddModal(false);
    setSelectedProductIds([]);
  };

  const toggleProduct = (productId: string) =>
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );

  // Batch-add: one product failing shouldn't abort the rest, and "already in
  // collection" counts as success — so evaluate each independently.
  const addProductsMutation = useWebMutation(
    async () => {
      const results = await Promise.allSettled(
        selectedProductIds.map((productId) =>
          collectionsApi.addItem(collection!.id, { productId }),
        ),
      );
      let added = 0;
      let alreadyIn = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") {
          added++;
          continue;
        }
        const msg: string = r.reason?.response?.data?.message || "";
        if (
          r.reason?.response?.status === 400 &&
          msg.includes("zaten koleksiyonda")
        )
          alreadyIn++;
        else failed++;
      }
      return { added, alreadyIn, failed };
    },
    {
      errorMessage: t("collection.productsAddFailed"),
      onSuccess: async ({ added, alreadyIn, failed }) => {
        await invalidateCollection();
        if (added > 0)
          toast.success(
            `${added} ${t("collection.productsAddedToCollection")}`,
          );
        if (alreadyIn > 0)
          toast(`${alreadyIn} ${t("collection.alreadyInCollection")}`);
        if (failed > 0) toast.error(t("collection.productsAddFailed"));
        if (failed === 0) {
          close();
        } else {
          setSelectedProductIds([]);
          await refetchProducts();
        }
      },
    },
  );

  const handleAddProducts = () => {
    if (selectedProductIds.length === 0 || !collection) {
      toast.error(t("collection.selectItems"));
      return;
    }
    addProductsMutation.mutate();
  };

  return {
    t,
    collection,
    showAddModal,
    activeTab,
    setActiveTab,
    selectedProductIds,
    setSelectedProductIds,
    products,
    loadingProducts,
    close,
    toggleProduct,
    handleAddProducts,
    adding: addProductsMutation.isPending,
  };
}

export type UseAddItem = ReturnType<typeof useAddItem>;
