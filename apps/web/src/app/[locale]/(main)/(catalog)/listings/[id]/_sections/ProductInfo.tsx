"use client";

import toast from "react-hot-toast";
import {
  ArrowsRightLeftIcon,
  BoltIcon,
  FolderPlusIcon,
  PencilIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { Button, QuantityStepper } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useListingDetail } from "../_context/ListingDetailContext";
import SellerCard from "./SellerCard";

/** Interactive product actions; crawlable product copy is rendered on the server. */
export default function ProductInfo() {
  const {
    t,
    router,
    listing,
    isOwner,
    isAuthenticated,
    limits,
    canTrade,
    isTradeAvailable,
    isInCart,
    isAddingToCart,
    cartLoading,
    quantity,
    setQuantity,
    handleBuyNow,
    handleMakeOffer,
    handleCartToggle,
    handleOpenCollectionModal,
    requireAuth,
    setShowTradeModal,
  } = useListingDetail();

  if (!listing) return null;

  const available = listing.availableQuantity ?? listing.quantity;
  const hasStock = available == null || available > 0;

  // Adet seçici yalnız satılabilir, stok>1 olan ilanlarda (tek-stok 2. el ürün
  // için gösterme). Tavan: müsait stok ∧ 20 sipariş-cap'i.
  const showQuantityStepper =
    !isOwner &&
    listing.status === "active" &&
    available != null &&
    available > 1;
  const maxQuantity = available != null ? Math.min(available, 20) : undefined;

  return (
    <div>
      <div className="space-y-3 mb-6">
        {isOwner && (
          <>
            <ButtonLink
              href={`/listings/${listing.id}/edit`}
              className="w-full flex gap-2 py-4 text-lg"
            >
              <PencilIcon className="w-6 h-6" />
              {t("common.edit")}
            </ButtonLink>
            {limits?.canCreateCollections && (
              <Button
                variant="secondary"
                onClick={handleOpenCollectionModal}
                className="w-full flex gap-2"
              >
                <FolderPlusIcon className="w-5 h-5" />
                {t("collection.addToCollection")}
              </Button>
            )}
          </>
        )}

        {!isOwner && (
          <div className="flex items-center gap-3">
            {showQuantityStepper && (
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={maxQuantity}
                decreaseLabel={t("cart.decreaseQuantity")}
                increaseLabel={t("cart.increaseQuantity")}
              />
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={handleBuyNow}
              disabled={
                isAddingToCart ||
                cartLoading ||
                listing.status !== "active" ||
                !hasStock
              }
              isLoading={isAddingToCart}
              leftIcon={<BoltIcon className="w-5 h-5" />}
              className="flex-1"
            >
              {listing.status === "sold"
                ? t("product.sold")
                : listing.status === "reserved"
                  ? t("product.reserved")
                  : !hasStock
                    ? t("product.stockFinished")
                    : t("product.buyNow")}
            </Button>
          </div>
        )}

        {!isOwner && (
          <div
            className={`grid gap-2 ${isTradeAvailable ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {isTradeAvailable && (
              <Button
                variant="success"
                onClick={() => {
                  if (listing.status !== "active") {
                    toast.error(t("product.notForSale"));
                    return;
                  }
                  if (!isAuthenticated) {
                    requireAuth({
                      title: t("auth.loginRequired"),
                      message: t("trade.loginToTrade"),
                      icon: (
                        <ArrowsRightLeftIcon className="w-12 h-12 text-primary-500" />
                      ),
                    });
                    return;
                  }
                  if (!canTrade) {
                    setShowTradeModal(true);
                    return;
                  }
                  router.push(`/profile/trades/new?listing=${listing.id}`);
                }}
                disabled={listing.status !== "active"}
                leftIcon={<ArrowsRightLeftIcon className="w-5 h-5" />}
                className="w-full"
              >
                {t("product.trade")}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleMakeOffer}
              disabled={listing.status !== "active"}
              leftIcon={<BoltIcon className="w-5 h-5" />}
              className="w-full"
            >
              {t("product.makeOffer")}
            </Button>
            <Button
              variant={isInCart ? "danger" : "secondary"}
              onClick={handleCartToggle}
              disabled={
                isAddingToCart || cartLoading || listing.status !== "active"
              }
              isLoading={isAddingToCart}
              leftIcon={<ShoppingCartIcon className="w-5 h-5" />}
              className="w-full"
            >
              {isAddingToCart
                ? isInCart
                  ? t("product.removing")
                  : t("product.adding")
                : isInCart
                  ? t("product.removeFromCart")
                  : t("product.addToCart")}
            </Button>
          </div>
        )}
      </div>

      <SellerCard />
    </div>
  );
}
