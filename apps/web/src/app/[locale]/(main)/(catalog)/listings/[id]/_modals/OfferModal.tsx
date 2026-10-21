/** @format */

"use client";

import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  FormInput,
  FormTextarea,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import { offersApi } from "@/lib/api";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { useOfferFloor } from "@/hooks/usePublicSettings";
import { useListingDetail } from "../_context/ListingDetailContext";
import { offerSchema, type OfferValues } from "./offerSchema";
import { formatTL } from "@/lib/format";
import { tlAmountValue } from "@/lib/tlAmount";

/**
 * Make-offer dialog — owns its RHF+zod form and the create-offer mutation, framed
 * by the shared `FormModal`. The context holds only open/close state + the listing
 * price, from which the min (50%) / max (< price) offer bounds are derived.
 */
export default function OfferModal() {
  const {
    t,
    locale,
    listing,
    effectivePrice,
    showOfferModal,
    setShowOfferModal,
  } = useListingDetail();
  const modalLabels = useFormModalLabels();

  const minOffer = Math.round(effectivePrice * 0.5);
  const floor = useOfferFloor(effectivePrice);
  const form = useZodForm(
    offerSchema(minOffer, effectivePrice, locale, floor),
    {
      defaultValues: { amount: "", message: "" },
    },
  );
  const message = form.watch("message") ?? "";

  const create = useMutation({
    mutationFn: (values: OfferValues) =>
      offersApi.create({
        productId: listing!.id,
        // The schema accepted the text, so the parser reads an amount.
        amount: tlAmountValue(values.amount),
        message: values.message?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("product.offerSentSuccess"));
      setShowOfferModal(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message || t("product.offerFailed")),
  });

  if (!listing) return null;

  return (
    <FormModal
      open={showOfferModal}
      onClose={() => setShowOfferModal(false)}
      title={t("product.makeOffer")}
      form={form}
      onSubmit={(values) => create.mutate(values)}
      isSubmitting={create.isPending}
      resetValues={{ amount: "", message: "" }}
      submitLabel={t("product.sendOffer")}
      size="md"
      {...modalLabels}
    >
      <div>
        <label className="block text-sm font-medium text-body mb-2">
          {t("product.productPrice")}
        </label>
        <div className="text-lg font-semibold text-heading">
          {formatTL(effectivePrice)}
        </div>
        <p className="text-xs text-muted mt-1">
          {t("offer.minimumOffer")}: {formatTL(minOffer)} (%50)
        </p>
      </div>

      <FormInput
        name="amount"
        type="text"
        inputMode="decimal"
        label={t("offer.yourOfferAmount")}
        placeholder={t("product.offerAmountPlaceholder")}
        helperText={
          floor != null
            ? t("listing.priceMinHint", { minPrice: formatTL(floor) })
            : undefined
        }
      />

      <div>
        <FormTextarea
          name="message"
          label={t("offer.offerMessage")}
          placeholder={t("product.offerMessagePlaceholder")}
          rows={4}
          maxLength={500}
        />
        <p className="text-xs text-muted mt-1">
          {message.length}/500 {t("collection.characters")}
        </p>
      </div>
    </FormModal>
  );
}
