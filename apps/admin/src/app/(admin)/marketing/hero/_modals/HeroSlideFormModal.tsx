"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { ImageUploadField } from "@/components/form/ImageUploadField";
import { LocaleTabs } from "@/components/form/LocaleTabs";
import { localizedKey, type LocaleLang } from "@/lib/localized-form";
import { HeroPreview } from "../_components/HeroPreview";
import {
  HERO_LOCALIZED_FIELDS,
  emptyHeroForm,
  heroFormToPayload,
  heroSchema,
  heroToForm,
  imageSideOptions,
  placementOptions,
  type HeroFormValues,
  type HeroPlacement,
  type HeroSlide,
} from "../_lib/types";

const uploadHeroImage = async (file: File) =>
  (await adminApi.uploadHeroImage(file)).data?.url;

/** Görsel tarafı seçici + seçilen yerleşimin tek satırlık açıklaması. */
function ImageSideField() {
  const t = useTranslations();
  const side = useWatch({ name: "imageSide" }) as string;
  return (
    <FormSelect
      name="imageSide"
      label={t("admin.marketing.hero.imageSideLabel")}
      options={imageSideOptions(t)}
      helperText={t(`admin.marketing.hero.imageSideHint.${side}`)}
    />
  );
}

/** TR/EN sekmeli metin alanları (başlık, alt başlık, görsel alt metni, CTA etiketleri). */
function TextFields({
  lang,
  onLangChange,
}: {
  lang: LocaleLang;
  onLangChange: (lang: LocaleLang) => void;
}) {
  const t = useTranslations();
  const field = (base: (typeof HERO_LOCALIZED_FIELDS)[number]) =>
    localizedKey(base, lang);
  return (
    <LocaleTabs
      bases={HERO_LOCALIZED_FIELDS}
      value={lang}
      onChange={onLangChange}
    >
      {() => (
        <div className="space-y-4">
          <FormInput
            key={field("title")}
            name={field("title")}
            label={t("admin.marketing.hero.fields.title")}
          />
          <FormInput
            key={field("subtitle")}
            name={field("subtitle")}
            label={t("admin.marketing.hero.fields.subtitle")}
          />
          <FormInput
            key={field("imageAlt")}
            name={field("imageAlt")}
            label={t("admin.marketing.hero.fields.imageAlt")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormInput
              key={field("cta1Label")}
              name={field("cta1Label")}
              label={t("admin.marketing.hero.fields.cta1Label")}
            />
            <FormInput
              key={field("cta2Label")}
              name={field("cta2Label")}
              label={t("admin.marketing.hero.fields.cta2Label")}
            />
          </div>
        </div>
      )}
    </LocaleTabs>
  );
}

/** Create/edit hero slide. Mount with `key={slide?.id ?? 'new'}` so defaults seed fresh. */
export function HeroSlideFormModal({
  open,
  onClose,
  slide,
  defaultPlacement,
}: {
  open: boolean;
  onClose: () => void;
  slide?: HeroSlide;
  defaultPlacement: HeroPlacement;
}) {
  const t = useTranslations();
  const isEdit = Boolean(slide);
  const [lang, setLang] = useState<LocaleLang>("tr");
  const form = useZodForm(heroSchema(t), {
    defaultValues: slide ? heroToForm(slide) : emptyHeroForm(defaultPlacement),
  });

  const save = useAdminMutation(
    (v: HeroFormValues) =>
      isEdit
        ? adminApi.updateHeroSlide(slide!.id, heroFormToPayload(v, "update"))
        : adminApi.createHeroSlide(heroFormToPayload(v, "create")),
    {
      invalidates: ["hero-slides"],
      successMessage: isEdit
        ? t("admin.marketing.hero.updated")
        : t("admin.marketing.hero.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit ? t("admin.marketing.hero.edit") : t("admin.marketing.hero.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      size="2xl"
    >
      <HeroPreview lang={lang} />
      <FormSelect
        name="placement"
        label={t("admin.marketing.hero.placementLabel")}
        options={placementOptions(t)}
      />
      <TextFields lang={lang} onLangChange={setLang} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput
          name="cta1Href"
          label={t("admin.marketing.hero.fields.cta1Href")}
          placeholder={t("admin.marketing.ads.linkUrlPlaceholder")}
        />
        <FormInput
          name="cta2Href"
          label={t("admin.marketing.hero.fields.cta2Href")}
          placeholder={t("admin.marketing.ads.linkUrlPlaceholder")}
        />
      </div>
      <ImageUploadField
        name="imageUrl"
        label={t("admin.marketing.hero.desktopImage")}
        upload={uploadHeroImage}
      />
      <ImageUploadField
        name="mobileImageUrl"
        label={t("admin.marketing.hero.mobileImage")}
        helperText={t("admin.marketing.hero.mobileImageHint")}
        upload={uploadHeroImage}
      />
      <ImageSideField />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormDatePicker
          name="startDate"
          label={t("admin.marketing.ads.startDate")}
        />
        <FormDatePicker
          name="endDate"
          label={t("admin.marketing.ads.endDate")}
        />
      </div>
      <FormCheckbox
        name="hideOnIos"
        label={
          <span>
            {t("admin.marketing.hero.hideOnIos")}
            <span className="block text-xs text-muted">
              {t("admin.marketing.hero.hideOnIosHint")}
            </span>
          </span>
        }
      />
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}
