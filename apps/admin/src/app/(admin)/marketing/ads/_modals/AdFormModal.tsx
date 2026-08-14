"use client";

import { useRef, useState, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { Button, Input, Spinner } from "@tarodan/ui";
import {
  CloudArrowUpIcon,
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

/** Drag-drop upload + dimension detection + IAB presets, bound to the RHF form. */
function AdImageField() {
  const t = useTranslations();
  const { watch, setValue } = useFormContext<AdFormValues>();
  const imageUrl = watch("imageUrl");
  const width = watch("width");
  const height = watch("height");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(t("admin.marketing.ads.upload.formats"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("admin.marketing.ads.upload.maxSize"));
      return;
    }
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

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };

  const compliant = isIabSize(width, height);

  return (
    <div className="space-y-2">
      <span className="block text-sm text-muted">
        {t("admin.marketing.ads.image")}
      </span>
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragActive ? "border-primary-500 bg-primary-50" : "border-border"
        }`}
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
      >
        {uploading ? (
          <div className="text-muted">
            <Spinner size="lg" className="mx-auto mb-2" />
            {t("common.loading")}
          </div>
        ) : imageUrl ? (
          <div className="space-y-3">
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
        ) : (
          <div>
            <CloudArrowUpIcon className="mx-auto mb-2 h-10 w-10 text-muted" />
            <p className="mb-2 text-muted">
              {t("admin.marketing.ads.upload.dropHint")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              {t("admin.marketing.ads.upload.chooseFile")}
            </Button>
            <p className="mt-2 text-xs text-muted">JPG, PNG, WebP • Max 2MB</p>
          </div>
        )}
      </div>

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
