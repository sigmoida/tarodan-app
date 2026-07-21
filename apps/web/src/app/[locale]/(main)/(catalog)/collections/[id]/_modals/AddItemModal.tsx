/** @format */

"use client";

import { Modal, Tabs, TabsList, TabsTrigger, TabsContent } from "@tarodan/ui";
import { useAddItem } from "../_hooks/useAddItem";
import ProductPickerList from "../_components/ProductPickerList";
import CustomItemForm from "../_components/CustomItemForm";

export default function AddItemModal() {
  const s = useAddItem();
  const { t, collection, showAddModal, activeTab, setActiveTab, close } = s;

  if (!collection) return null;

  return (
    <Modal
      isOpen={showAddModal}
      onClose={close}
      title={t("collection.addProductToCollection")}
      maxWidth="max-w-md"
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "products" | "custom")}
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
          <CustomItemForm onClose={close} />
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
