/** @format */

"use client";

import {
  FormModal,
  FormSelect,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  LISTING_REMOVAL_PLATFORMS,
  listingRemovalPlatformI18nKey,
  listingRemovalReasonI18nKey,
  listingRemovalReasonOptions,
} from "@tarodan/types";
import type { ListingRemovalPayload } from "@/lib/api";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import {
  EMPTY_LISTING_REMOVAL,
  listingRemovalSchema,
  toListingRemovalPayload,
  type ListingRemovalValues,
  type SellerRemovalAction,
} from "./listingRemovalSchema";

interface ListingRemovalModalProps {
  action: SellerRemovalAction;
  open: boolean;
  onClose: () => void;
  /** Receives the API payload; the caller owns the mutation. */
  onSubmit: (removal: ListingRemovalPayload) => void;
  isSubmitting: boolean;
}

/**
 * Asks the seller WHY a listing is leaving the storefront — on delete and on
 * deactivate. Shared by "My listings" and the edit page; each owns its own
 * mutation and passes it in. Reasons come from the shared catalog for the
 * action (a temporary pause exists only for deactivation).
 */
export default function ListingRemovalModal({
  action,
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: ListingRemovalModalProps) {
  const t = useTranslations();
  const modalLabels = useFormModalLabels();
  const form = useZodForm(listingRemovalSchema(t, action), {
    defaultValues: EMPTY_LISTING_REMOVAL,
  });
  const reason = form.watch("reason");
  const platform = form.watch("platform");
  const isDelete = action === "delete";
  const otherPlatform = reason === "sold_elsewhere" && platform === "other";

  const reasonOptions = listingRemovalReasonOptions("seller", action).map(
    (value) => ({
      value,
      label: t(listingRemovalReasonI18nKey(value) as MessageKey),
    }),
  );
  const platformOptions = LISTING_REMOVAL_PLATFORMS.map((value) => ({
    value,
    label: t(listingRemovalPlatformI18nKey(value) as MessageKey),
  }));

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isDelete
          ? t("product.deleteListing")
          : t("product.deactivateListingFull")
      }
      form={form}
      onSubmit={(values: ListingRemovalValues) =>
        onSubmit(toListingRemovalPayload(values))
      }
      isSubmitting={isSubmitting}
      resetValues={EMPTY_LISTING_REMOVAL}
      submitLabel={
        isDelete ? t("collection.yesDelete") : t("product.deactivate")
      }
      destructive={isDelete}
      size="md"
      {...modalLabels}
    >
      <p className="text-sm text-body">
        {isDelete
          ? t("product.removal.deleteDescription")
          : t("product.removal.deactivateDescription")}
      </p>

      <FormSelect
        name="reason"
        label={t("product.removal.reasonLabel")}
        placeholder={t("product.removal.reasonPlaceholder")}
        options={reasonOptions}
      />

      {reason === "sold_elsewhere" && (
        <FormSelect
          name="platform"
          label={t("product.removal.platformLabel")}
          placeholder={t("product.removal.platformPlaceholder")}
          options={platformOptions}
        />
      )}

      <FormTextarea
        name="detail"
        label={
          otherPlatform
            ? t("product.removal.detailRequiredLabel")
            : t("product.removal.detailLabel")
        }
        placeholder={
          otherPlatform
            ? t("product.removal.otherPlatformPlaceholder")
            : t("product.removal.detailPlaceholder")
        }
        rows={3}
        maxLength={LISTING_REMOVAL_DETAIL_MAX_LENGTH}
      />

      <p className="text-xs text-muted">{t("product.removal.privacyNote")}</p>
    </FormModal>
  );
}
