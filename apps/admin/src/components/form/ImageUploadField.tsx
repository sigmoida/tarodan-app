"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button, FileDropzone } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Panel } from "@/components/detail/Panel";
import { extractErrorMessage } from "@/lib/error";

// Sunucu sınırıyla aynı (ads + hero upload uçları 5 MB kabul eder).
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Sürükle-bırak görsel yükleme; alan değeri yüklenen görselin URL'sidir.
 * Seçilen dosya anında yüklenip URL'e dönüştüğü için dropzone bekleyen dosya
 * tutmaz (`value` daima null), önizleme ayrı gösterilir. Metinler reklam
 * formuyla ortaktır (`admin.marketing.ads.upload.*`).
 */
export function ImageUploadField({
  name,
  label,
  helperText,
  upload,
}: {
  name: string;
  label: string;
  helperText?: string;
  /** Dosyayı yükleyip saklanan URL'i döner (`adminApi.upload…`). */
  upload: (file: File) => Promise<string | undefined>;
}) {
  const t = useTranslations();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();
  const url = (watch(name) as string) || "";
  const error = errors[name]?.message as string | undefined;
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await upload(file);
      if (!uploaded) {
        toast.error(t("admin.marketing.ads.upload.failed"));
        return;
      }
      setValue(name, uploaded, { shouldDirty: true, shouldValidate: true });
      toast.success(t("admin.marketing.ads.upload.success"));
    } catch (e) {
      toast.error(
        extractErrorMessage(e, t("admin.marketing.ads.upload.failed")),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm text-muted">{label}</span>
      {url ? (
        <Panel className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="mx-auto max-h-40 rounded object-contain"
          />
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={() =>
              setValue(name, "", { shouldDirty: true, shouldValidate: true })
            }
          >
            {t("admin.marketing.ads.removeImage")}
          </Button>
        </Panel>
      ) : null}
      <FileDropzone
        accept="image/jpeg,image/png,image/webp"
        maxBytes={IMAGE_MAX_BYTES}
        value={null}
        busy={uploading}
        onChange={(file) => {
          if (file) void onFile(file);
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
      {helperText && !error ? (
        <p className="text-xs text-muted">{helperText}</p>
      ) : null}
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
