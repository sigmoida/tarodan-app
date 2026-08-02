/** @format */

"use client";

import { useState } from "react";
import {
  Modal,
  ModalFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@tarodan/ui";
import { useAddItem } from "../_hooks/useAddItem";
import ProductPickerList from "../_components/ProductPickerList";
import CustomItemForm from "../_components/CustomItemForm";

export default function AddItemModal() {
  const s = useAddItem();
  const { t, collection, showAddModal, activeTab, setActiveTab, close } = s;
  const [customPending, setCustomPending] = useState(false);
  const customFormId = "collection-custom-item-form";
  const pending = s.adding || customPending;

  if (!collection) return null;

  return (
    <Modal
      isOpen={showAddModal}
      onClose={close}
      title={t("collection.addProductToCollection")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={pending}
      footer={
        activeTab === "products" ? (
          <ModalFooter
            onCancel={close}
            onConfirm={s.handleAddProducts}
            cancelLabel={t("common.cancel")}
            confirmLabel={
              s.selectedProductIds.length > 0
                ? `${s.selectedProductIds.length} ${t("collection.addProduct")}`
                : t("common.add")
            }
            isLoading={s.adding}
            disabled={s.selectedProductIds.length === 0}
          />
        ) : (
          <ModalFooter
            onCancel={close}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("common.add")}
            confirmForm={customFormId}
            isLoading={customPending}
          />
        )
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (!pending) setActiveTab(v as "products" | "custom");
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="products" className="flex-1">
            {t("collection.myListings")}
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex-1">
            {t("collection.customProduct")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductPickerList s={s} />
        </TabsContent>
        <TabsContent value="custom">
          <CustomItemForm
            formId={customFormId}
            onClose={close}
            onPendingChange={setCustomPending}
          />
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
