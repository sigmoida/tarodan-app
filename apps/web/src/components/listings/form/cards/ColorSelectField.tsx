/** @format */

"use client";

import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { FormInput } from "@tarodan/ui/form";
import { MAX_LISTING_COLORS, type ColorOption } from "../constants";

interface ColorSelectFieldProps {
  colorList: ColorOption[];
  /**
   * Düzenlemede eşleşmeyen eski serbest metin renk ("Füme" gibi). Satıcı
   * listeden seçmek zorunda; ne yazdığı kaybolmasın diye ipucu olarak gösterilir.
   */
  legacyColor?: string | null;
}

/**
 * İlan rengi — katalogdan çoklu seçim (en fazla `MAX_LISTING_COLORS`).
 *
 * Katalog boşsa (henüz renk tanımlanmamış kurulum) eski serbest metin alanına
 * düşer: satıcı ilan açamaz hale gelmesin.
 */
export default function ColorSelectField({
  colorList,
  legacyColor,
}: ColorSelectFieldProps) {
  const t = useTranslations();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();
  const selected: string[] = watch("colors") ?? [];

  if (colorList.length === 0) {
    return (
      <FormInput
        name="color"
        label={t("product.colorRequired")}
        placeholder={t("product.colorPlaceholder")}
        maxLength={80}
      />
    );
  }

  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((item) => item !== slug)
      : selected.length >= MAX_LISTING_COLORS
        ? selected
        : [...selected, slug];
    setValue("colors", next, { shouldDirty: true, shouldValidate: true });
  };

  const error = errors.colors?.message as string | undefined;
  const atLimit = selected.length >= MAX_LISTING_COLORS;

  return (
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-body mb-1">
        {t("product.colorRequired")}
        <span className="ml-2 text-xs text-muted">
          {t("product.colorMaxHint", { max: MAX_LISTING_COLORS })}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {colorList.map((option) => {
          const isSelected = selected.includes(option.slug);
          return (
            <Button
              key={option.slug}
              type="button"
              variant="secondary"
              disabled={!isSelected && atLimit}
              onClick={() => toggle(option.slug)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                isSelected
                  ? "bg-primary-500 text-inverted border-primary-500"
                  : "bg-surface text-body border-border-subtle hover:bg-surface-alt"
              }`}
            >
              {option.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-border-subtle"
                  style={{ backgroundColor: option.color }}
                  aria-hidden="true"
                />
              )}
              {option.label}
            </Button>
          );
        })}
      </div>
      {legacyColor && selected.length === 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("product.colorLegacyHint", { value: legacyColor })}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
