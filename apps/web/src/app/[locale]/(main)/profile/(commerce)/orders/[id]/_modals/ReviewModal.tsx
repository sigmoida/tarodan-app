/** @format */

"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import OrderReviewModal from "@/components/reviews/OrderReviewModal";
import { useSubmitReview } from "../_hooks/useOrderDetail";
import { getProductInfo, type OrderDetail } from "../_lib/types";

interface ReviewModalProps {
  order: OrderDetail | null;
  orderId: string;
  onClose: () => void;
}

/** Product + seller review for a delivered order (detail page). Thin wrapper
 *  that resolves the product/seller and wires the submit mutation into the
 *  shared OrderReviewModal. */
export default function ReviewModal({
  order,
  orderId,
  onClose,
}: ReviewModalProps) {
  const t = useTranslations();
  const submitReview = useSubmitReview(orderId);
  const product = order ? getProductInfo(order) : undefined;

  return (
    <OrderReviewModal
      open={!!order}
      onClose={onClose}
      product={
        product
          ? { title: product.title, imageUrl: product.imageUrl }
          : undefined
      }
      sellerName={order?.seller?.displayName}
      isSubmitting={submitReview.isPending}
      onSubmit={(v) => {
        if (!order) return;
        const productId = product?.id;
        if (!productId) {
          toast.error(t("order.orderNotFound"));
          return;
        }
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
