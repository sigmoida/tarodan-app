"use client";

import { useState, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { Button, FileDropzone, Input } from "@tarodan/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { extractErrorMessage } from "@/lib/error";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type Ad,
  type AdFormValues,
  adSchema,
  adToForm,
  emptyAdForm,
  adFormToPayload,
  positionOptions,
  deviceOptions,
  IAB_SIZES,
  isIabSize,
} from "../_lib/types";

const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Drag-drop upload + dimension detection + IAB presets, bound to the RHF form. */
function AdImageField() {
  const t = useTranslations();
  const { watch, setValue } = useFormContext<AdFormValues>();
  const imageUrl = watch("imageUrl");
  const width = watch("width");
  const height = watch("height");
  const [uploading, setUploading] = useState(false);

  const setDims = useCallback(
    (w: number, h: number) => {
      setValue("width", w, { shouldDirty: true });
      setValue("height", h, { shouldDirty: true });
    },
    [setValue],
  );

  const loadDims = useCallback(
    (url: string) => {
      const img = new window.Image();
      img.onload = () => setDims(img.naturalWidth, img.naturalHeight);
      img.src = url;
    },
    [setDims],
  );

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const res = await adminApi.uploadMedia(file);
      const url = (res.data as { url?: string })?.url;
      if (url) {
        setValue("imageUrl", url, { shouldDirty: true });
        loadDims(url);
        toast.success(t("admin.marketing.ads.upload.success"));
      }
    } catch (error) {
      toast.error(
        extractErrorMessage(error, t("admin.marketing.ads.upload.failed")),
      );
    } finally {
      setUploading(false);
    }
  };

  const compliant = isIabSize(width, height);

  return (
    <div className="space-y-2">
      <span className="block text-sm text-muted">
        {t("admin.marketing.ads.image")}
      </span>
      {imageUrl ? (
        <div className="space-y-3 rounded-lg border border-border p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={t("admin.marketing.ads.preview")}
            className="mx-auto max-h-48 rounded object-contain"
          />
          <div className="flex items-center justify-center gap-2 text-sm">
            {width && height ? (
              <span className="text-muted">
                {width} x {height} px
              </span>
            ) : null}
            {width && height ? (
              compliant ? (
                <span className="flex items-center gap-1 text-success-700">
                  <CheckCircleIcon className="h-4 w-4" />{" "}
                  {t("admin.marketing.ads.iabCompliant")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-warning-700">
                  <ExclamationTriangleIcon className="h-4 w-4" /> Non-IAB
                </span>
              )
            ) : null}
          </div>
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={() => {
              setValue("imageUrl", "", { shouldDirty: true });
              setDims(0, 0);
            }}
          >
            {t("admin.marketing.ads.removeImage")}
          </Button>
        </div>
      ) : null}

      {/*
        Seçilen dosya anında yüklenip URL'e dönüştüğü için alan bekleyen bir
        dosya tutmaz: `value` daima null, önizleme yukarıda ayrı gösterilir.
      */}
      <FileDropzone
        accept="image/jpeg,image/png,image/webp"
        maxBytes={AD_IMAGE_MAX_BYTES}
        value={null}
        busy={uploading}
        onChange={(file) => {
          if (file) void upload(file);
        }}
        onReject={(_file, reason) =>
          toast.error(
            reason === "size"
              ? t("admin.marketing.ads.upload.maxSize")
              : t("admin.marketing.ads.upload.formats"),
          )
        }
        labels={{
          idle: t("admin.marketing.ads.upload.dropHint"),
          active: t("common.fileDropzone.active"),
          select: t("admin.marketing.ads.upload.chooseFile"),
          replace: t("admin.marketing.ads.upload.chooseFile"),
          remove: t("common.fileDropzone.remove"),
          busy: t("common.loading"),
          hint: t("admin.marketing.ads.upload.hint"),
        }}
      />

      <Input
        type="url"
        value={imageUrl}
        onChange={(e) => {
          const url = e.target.value;
          setValue("imageUrl", url, { shouldDirty: true });
          if (url) loadDims(url);
          else setDims(0, 0);
        }}
        placeholder={t("admin.marketing.ads.upload.urlPlaceholder")}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        {IAB_SIZES.slice(0, 6).map((s) => (
          <Button
            key={`${s.width}x${s.height}`}
            type="button"
            size="sm"
            variant={
              width === s.width && height === s.height ? "primary" : "outline"
            }
            onClick={() => setDims(s.width, s.height)}
          >
            {s.name} ({s.width}x{s.height})
          </Button>
        ))}
      </div>

      {!!width && !!height && !compliant && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3 text-sm text-warning-700">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-warning-500" />
          {t("admin.marketing.ads.iabWarning", { width, height })}
        </div>
      )}
    </div>
  );
}

/** Create/edit ad. Mount with `key={ad?.id ?? 'new'}` so defaults seed fresh. */
export function AdFormModal({
  open,
  onClose,
  ad,
}: {
  open: boolean;
  onClose: () => void;
  ad?: Ad;
}) {
  const t = useTranslations();
  const isEdit = Boolean(ad);
  const form = useZodForm(adSchema(t), {
    defaultValues: ad ? adToForm(ad) : emptyAdForm,
  });

  const save = useAdminMutation(
    (v: AdFormValues) =>
      isEdit
        ? adminApi.updateAd(ad!.id, adFormToPayload(v))
        : adminApi.createAd(adFormToPayload(v)),
    {
      invalidates: ["ads"],
      successMessage: isEdit
        ? t("admin.marketing.ads.updated")
        : t("admin.marketing.ads.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit ? t("admin.marketing.ads.edit") : t("admin.marketing.ads.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      size="2xl"
    >
      <FormInput
        name="title"
        label={t("common.title")}
        placeholder={t("admin.marketing.ads.titlePlaceholder")}
      />
      <AdImageField />
      <FormInput
        name="altText"
        label={t("admin.marketing.ads.altText")}
        placeholder={t("admin.marketing.ads.altTextPlaceholder")}
      />
      <FormInput
        name="linkUrl"
        label="Link URL"
        placeholder={t("admin.marketing.ads.linkUrlPlaceholder")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="position"
          label={t("admin.marketing.ads.positionLabel")}
          options={positionOptions(t)}
        />
        <FormSelect
          name="deviceType"
          label={t("admin.marketing.ads.deviceType")}
          options={deviceOptions(t)}
        />
      </div>
      <FormInput
        name="displayOrder"
        label={t("admin.marketing.ads.displayOrder")}
        type="number"
        placeholder="0"
      />
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
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}
