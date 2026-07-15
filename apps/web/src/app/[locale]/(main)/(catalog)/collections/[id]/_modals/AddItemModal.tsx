/** @format */

"use client";

import { Button, Modal } from "@tarodan/ui";
import { useAddItem } from "../_hooks/useAddItem";
import ProductPickerList from "../_components/ProductPickerList";
import CustomItemForm from "../_components/CustomItemForm";

export default function AddItemModal() {
  const s = useAddItem();
  const {
    t,
    collection,
    showAddModal,
    activeTab,
    setActiveTab,
    products,
    loadingProducts,
    close,
  } = s;

  if (!collection) return null;

  const tabClass = (tab: "products" | "custom") =>
    `flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
      activeTab === tab
        ? "bg-surface-elevated text-heading shadow-sm"
        : "text-muted hover:text-body"
    }`;

  return (
    <Modal
      isOpen={showAddModal}
      onClose={close}
      title={t("collection.addProductToCollection")}
      maxWidth="max-w-md"
    >
      <div>
        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded bg-surface-alt p-0.5">
          <Button
            variant="secondary"
            onClick={() => setActiveTab("products")}
            className={tabClass("products")}
          >
            İlanlarım
          </Button>
          <Button
            variant="secondary"
            onClick={() => setActiveTab("custom")}
            className={tabClass("custom")}
          >
            Custom Ürün
          </Button>
        </div>

        {activeTab === "products" && <ProductPickerList s={s} />}

        {activeTab === "custom" && <CustomItemForm s={s} />}

        {activeTab === "products" &&
          (products.length === 0 || loadingProducts) && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 w-full"
              onClick={close}
            >
              {t("common.close")}
            </Button>
          )}
      </div>
    </Modal>
  );
}
