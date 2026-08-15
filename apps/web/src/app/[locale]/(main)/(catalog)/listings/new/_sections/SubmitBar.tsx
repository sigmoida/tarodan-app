/** @format */

"use client";

import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { IMAGE_SUBMIT_BLOCKER_KEY } from "@/components/listings/form/listing-image-item";
import { useNewListing } from "../_context/NewListingContext";

export default function SubmitBar() {
  const t = useTranslations();
  const { router, form, imageSubmitBlocker } = useNewListing();
  const isSubmitting = form.formState.isSubmitting;
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        variant="secondary"
        className="flex-1"
        onClick={() => router.back()}
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="submit"
        variant="primary"
        className="flex-1"
        disabled={isSubmitting || !!imageSubmitBlocker}
      >
        {isSubmitting ? t("common.creating") : t("product.createListing")}
      </Button>
      {imageSubmitBlocker && (
        <p role="status" className="w-full text-sm text-danger-600">
          {t(IMAGE_SUBMIT_BLOCKER_KEY[imageSubmitBlocker.reason])}
        </p>
      )}
    </div>
  );
}
