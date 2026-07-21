/** @format */

"use client";

import OrderReviewModal from "@/components/reviews/OrderReviewModal";
import { useSubmitReview } from "../_hooks/useOrders";
import { getOrderPrimary, getOrderProductId, type Order } from "../_lib/types";

interface ReviewModalProps {
  order: Order | null;
  onClose: () => void;
}

/** Product + seller review for a delivered order (orders list). Thin wrapper
 *  that resolves the product/seller and wires the submit mutation into the
 *  shared OrderReviewModal. */
export default function ReviewModal({ order, onClose }: ReviewModalProps) {
  const submitReview = useSubmitReview();
  const primary = order
    ? getOrderPrimary(order)
    : { product: undefined, image: undefined };
  const productId = order ? getOrderProductId(order) : undefined;

  return (
    <OrderReviewModal
      open={!!order}
      onClose={onClose}
      product={
        primary.product
          ? { title: primary.product.title, imageUrl: primary.image }
          : undefined
      }
      sellerName={order?.seller?.displayName}
      isSubmitting={submitReview.isPending}
      onSubmit={(v) => {
        if (!order || !productId) return;
        submitReview.mutate(
          {
            order,
            productId,
            sellerId: order.seller?.id,
            reviewScore: v.productScore,
            reviewTitle: v.title || "",
            reviewText: v.text || "",
            images: v.images,
            sellerCommunication: v.communication,
            sellerShipping: v.shipping,
            sellerPackaging: v.packaging,
            sellerReviewText: v.sellerText || "",
          },
          { onSuccess: onClose },
        );
      }}
    />
  );
}
