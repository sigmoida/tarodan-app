/** @format */

"use client";

import { Button, Modal, Spinner } from "@tarodan/ui";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function CollectionPickerModal() {
  const {
    t,
    router,
    showCollectionModal,
    setShowCollectionModal,
    collections,
    loadingCollections,
    addingToCollection,
    handleAddToCollection,
  } = useListingDetail();

  return (
    <Modal
      isOpen={showCollectionModal}
      onClose={() => setShowCollectionModal(false)}
      title={t("collection.addToCollection")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={addingToCollection}
      footer={
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setShowCollectionModal(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      {loadingCollections ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" color="border-primary-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {collections.length > 0 ? (
            collections.map((collection) => (
              <Button
                variant="secondary"
                key={collection.id}
                onClick={() => handleAddToCollection(collection.id)}
                disabled={addingToCollection}
                className="w-full rounded p-4 text-left"
              >
                <h3 className="font-medium text-heading">{collection.name}</h3>
                {collection.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {collection.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">
                  {collection.itemCount || 0} {t("collection.products")}
                </p>
              </Button>
            ))
          ) : (
            <p className="py-8 text-center text-muted">
              {t("collection.noCollections")}
            </p>
          )}

          <Button
            variant="secondary"
            onClick={() => {
              setShowCollectionModal(false);
              router.push("/collections");
            }}
            className="w-full rounded border-2 border-dashed border-primary-300 bg-primary-50 p-4 font-medium text-primary-700 hover:bg-primary-100"
          >
            + {t("collection.createNewCollection")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
