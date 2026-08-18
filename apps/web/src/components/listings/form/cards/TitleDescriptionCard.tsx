/** @format */

"use client";

import { useTranslations } from "next-intl";
import { FormInput, FormTextarea } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";

/** "Temel Bilgiler" — title + description. Shared by new & edit forms. */
export default function TitleDescriptionCard() {
  const t = useTranslations();

  return (
    <SectionCard title={t("product.basicInfo")}>
      <div className="space-y-4">
        <FormInput
          name="title"
          label={t("product.titleRequired")}
          placeholder={t("product.titlePlaceholder")}
          maxLength={200}
        />
        <FormTextarea
          name="description"
          label={t("product.descriptionRequired")}
          placeholder={t("product.descriptionPlaceholder")}
          rows={5}
          minLength={30}
          maxLength={10000}
          helperText={t("product.descriptionLength")}
        />
      </div>
    </SectionCard>
  );
}
