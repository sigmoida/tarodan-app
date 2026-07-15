/** @format */

"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collectionsApi } from "@/lib/api";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import { useCollectionFilters } from "./useCollectionFilters";
import { useCarModels } from "./useCarModels";
import { useMyProducts } from "./useMyProducts";
import { EMPTY_CUSTOM } from "../_lib/add-item";

export function useAddItem() {
  const { t, collection, showAddModal, setShowAddModal, invalidateCollection } =
    useCollectionDetail();

  const [activeTab, setActiveTab] = useState<"products" | "custom">("products");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const filters = useCollectionFilters(showAddModal);
  const selectedBrandSlug = useMemo(
    () => filters.brands.find((b) => b.name === custom.brand)?.slug,
    [filters.brands, custom.brand],
  );
  const { models, isLoading: modelsLoading } = useCarModels(selectedBrandSlug);

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

  const patchCustom = (patch: Partial<typeof EMPTY_CUSTOM>) =>
    setCustom((prev) => ({ ...prev, ...patch }));

  const close = () => {
    setShowAddModal(false);
    setSelectedProductIds([]);
    setCustom(EMPTY_CUSTOM);
    setImageFile(null);
    setImagePreview(null);
  };

  const toggleProduct = (productId: string) =>
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

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

  const addCustomMutation = useWebMutation(
    () =>
      collectionsApi.addItem(collection!.id, {
        customTitle: custom.title.trim(),
        customDescription: custom.description.trim() || undefined,
        customBrand: custom.brand.trim() || undefined,
        customModel: custom.model.trim() || undefined,
        customYear: custom.year ? Number(custom.year) : undefined,
        customScale: custom.scale || undefined,
        customManufacturer: custom.manufacturer.trim() || undefined,
        customMaterial: custom.material || undefined,
        imageFile: imageFile || undefined,
      }),
    {
      successMessage: t("collection.productsAddedToCollection"),
      errorMessage: t("collection.productsAddFailed"),
      onSuccess: async () => {
        await invalidateCollection();
        close();
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

  const handleAddCustom = () => {
    if (!custom.title.trim() || !collection) {
      toast.error("Ürün ismi zorunludur");
      return;
    }
    addCustomMutation.mutate();
  };

  const adding = addProductsMutation.isPending || addCustomMutation.isPending;

  return {
    t,
    collection,
    showAddModal,
    activeTab,
    setActiveTab,
    selectedProductIds,
    setSelectedProductIds,
    custom,
    imagePreview,
    filters,
    models,
    modelsLoading,
    products,
    loadingProducts,
    patchCustom,
    close,
    toggleProduct,
    handleImageChange,
    handleAddProducts,
    handleAddCustom,
    adding,
  };
}

export type UseAddItem = ReturnType<typeof useAddItem>;
