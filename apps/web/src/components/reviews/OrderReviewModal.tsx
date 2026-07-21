/** @format */

"use client";

import { useState } from "react";
import { Controller } from "react-hook-form";
import { StarIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { z } from "zod";
import { Button, Modal } from "@tarodan/ui";
import { Form, FormInput, FormTextarea, useZodForm } from "@tarodan/ui/form";
import OptimizedImage from "@/components/OptimizedImage";
import { useTranslations } from "next-intl";

const PRODUCT_PLACEHOLDER =
  "https://placehold.co/96x96/f3f4f6/9ca3af?text=%F0%9F%9A%97";

export const orderReviewSchema = z.object({
  productScore: z.number().min(1).max(5),
  title: z.string().max(100).optional(),
  text: z.string().max(1000).optional(),
  communication: z.number().min(1).max(5),
  shipping: z.number().min(1).max(5),
  packaging: z.number().min(1).max(5),
  sellerText: z.string().optional(),
});

export type OrderReviewValues = z.infer<typeof orderReviewSchema>;

/** Values plus the collected image files (kept outside zod — multi-file). */
export type OrderReviewSubmit = OrderReviewValues & { images: File[] };

const EMPTY: OrderReviewValues = {
  productScore: 5,
  title: "",
  text: "",
  communication: 5,
  shipping: 5,
  packaging: 5,
  sellerText: "",
};

function StarRating({
  value,
  onChange,
  iconClass = "h-6 w-6",
}: {
  value: number;
  onChange: (n: number) => void;
  iconClass?: string;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Button
          key={star}
          type="button"
          variant="ghost"
          onClick={() => onChange(star)}
          className="h-auto w-auto p-1 transition-transform hover:scale-110"
        >
          {star <= value ? (
            <StarIcon className={`${iconClass} text-warning-400`} />
          ) : (
            <StarOutlineIcon className={`${iconClass} text-border-strong`} />
          )}
        </Button>
      ))}
    </div>
  );
}

export interface OrderReviewModalProps {
  open: boolean;
  onClose: () => void;
  product?: { title: string; imageUrl?: string };
  sellerName?: string;
  isSubmitting: boolean;
  onSubmit: (values: OrderReviewSubmit) => void;
}

/** Shared product + seller review form for a delivered order. Owns the RHF/zod
 *  form and the (multi-file) photo state; the caller wires its own submit
 *  mutation via `onSubmit`. Used by both the orders list and detail pages. */
export default function OrderReviewModal({
  open,
  onClose,
  product,
  sellerName,
  isSubmitting,
  onSubmit,
}: OrderReviewModalProps) {
  const t = useTranslations();
  const form = useZodForm(orderReviewSchema, { defaultValues: EMPTY });
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const addImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const next = files.slice(0, 5 - images.length);
    if (next.length === 0) return;
    setImages((prev) => [...prev, ...next]);
    next.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const sectionTitle =
    "mb-3 text-sm font-semibold uppercase tracking-wide text-muted";
  const fieldLabel = "mb-2 block text-sm font-medium text-body";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("review.reviewOrder")}
      maxWidth="max-w-lg"
    >
      <Form
        form={form}
        onSubmit={(values) => onSubmit({ ...values, images })}
        className="space-y-6"
      >
        {/* Product */}
        <div>
          <h3 className={sectionTitle}>{t("review.productReview")}</h3>

          {product && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-surface p-3">
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-surface-alt">
                <OptimizedImage
                  src={product.imageUrl || PRODUCT_PLACEHOLDER}
                  alt={product.title}
                  fill
                  className="object-cover"
                  fallbackSrc={PRODUCT_PLACEHOLDER}
                />
              </div>
              <p className="font-medium text-heading">{product.title}</p>
            </div>
          )}

          <div className="mb-3">
            <span className={fieldLabel}>{t("review.productScore")}</span>
            <Controller
              name="productScore"
              control={form.control}
              render={({ field }) => (
                <StarRating
                  value={field.value}
                  onChange={field.onChange}
                  iconClass="h-8 w-8"
                />
              )}
            />
          </div>

          <FormInput
            name="title"
            label={t("review.titleOptional")}
            placeholder={t("review.ratingTitlePlaceholder")}
            maxLength={100}
          />
          <FormTextarea
            name="text"
            label={t("review.commentOptional")}
            placeholder={t("review.productExperiencePlaceholder")}
            rows={3}
            maxLength={1000}
          />

          <div className="mt-3">
            <span className={fieldLabel}>{t("review.photosLabel")}</span>
            <div className="flex flex-wrap gap-2">
              {previews.map((src, idx) => (
                <div
                  key={idx}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removeImage(idx)}
                    aria-label={t("common.remove")}
                    className="absolute right-0 top-0 h-5 w-5 rounded-none rounded-bl-lg p-0"
                  >
                    ×
                  </Button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary-400">
                  <span className="text-2xl text-subtle">+</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={addImages}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Seller */}
        <div>
          <h3 className={sectionTitle}>{t("review.sellerReview")}</h3>

          {sellerName && (
            <p className="mb-4 text-sm text-muted">
              {t("product.seller")}:{" "}
              <span className="font-medium text-heading">{sellerName}</span>
            </p>
          )}

          <div className="space-y-3">
            {(
              [
                ["communication", t("review.communication")],
                ["shipping", t("review.shippingSpeed")],
                ["packaging", t("review.packaging")],
              ] as const
            ).map(([name, label]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm text-body">{label}</span>
                <Controller
                  name={name}
                  control={form.control}
                  render={({ field }) => (
                    <StarRating
                      value={field.value}
                      onChange={field.onChange}
                      iconClass="h-5 w-5"
                    />
                  )}
                />
              </div>
            ))}

            <FormTextarea
              name="sellerText"
              label={t("review.sellerComment")}
              placeholder={t("review.sellerCommentPlaceholder")}
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            isLoading={isSubmitting}
          >
            {t("review.submit")}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
