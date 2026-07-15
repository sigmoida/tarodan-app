/** @format */

"use client";

import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useNewListing } from "../_context/NewListingContext";

export default function SubmitBar() {
  const t = useTranslations();
  const { router, form } = useNewListing();
  const isSubmitting = form.formState.isSubmitting;
  return (
    <div className="flex gap-3">
      <Button
        type="button"
        variant="secondary"
        className="flex-1"
        onClick={() => router.back()}
      >
        İptal
      </Button>
      <Button
        type="submit"
        variant="primary"
        className="flex-1"
        disabled={isSubmitting}
      >
        {isSubmitting ? t("common.creating") : t("product.createListing")}
      </Button>
    </div>
  );
}
