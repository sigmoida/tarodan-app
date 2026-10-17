"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { Alert, Button, ConfirmDialog, FileDropzone, Input } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { Panel } from "@/components/detail/Panel";
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
  positionHint,
  AD_CONTENT_MAX,
  platformOptions,
  popupFrequencyOptions,
  hotspotIssues,
} from "../_lib/types";
import {
  fallbackSize,
  sizeAfterContextChange,
  type AdSize,
  type AdSizeSource,
} from "../_lib/sizePresets";
import { HotspotEditor } from "../_components/HotspotEditor";
import { AdSizePresets } from "../_components/AdSizePresets";
import {
  campaignLabel,
  selectableCampaigns,
  unwrapCampaigns,
} from "../_lib/campaigns";

// Sunucu sınırıyla aynı (`POST /admin/ads/upload` 5 MB kabul eder).
const AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Drag-drop upload + dimension detection + recommended sizes, bound to the RHF form. */
function AdImageField() {
  const t = useTranslations();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<AdFormValues>();
  const imageUrl = watch("imageUrl");
  const width = watch("width");
  const height = watch("height");
  const position = watch("position");
  const platform = watch("platform");
  const hotspotCount = (watch("hotspots") ?? []).length;
  const [uploading, setUploading] = useState(false);
  // Yazılan adres odak çıkınca uygulanır: her tuşta "alanlar silinsin mi?" sorulmasın.
  const [urlDraft, setUrlDraft] = useState(imageUrl);
  // Alanlar varken görsel değişirse/kalkarsa onay beklenir (alanlar silinir).
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  useEffect(() => setUrlDraft(imageUrl), [imageUrl]);

  // Boyutun kaynağı: kayıtlı reklamda mevcut değer, yeni görselde tarayıcının
  // okuduğu doğal boyut, çipte seçilen öneri. Yalnız çip seçimi pozisyon/platform
  // değişince temizlenir; geri dönüş sırası: görselden okunan → kayıtlı özgün →
  // boş. Kayıtlı boyut örtük olarak asla silinmez.
  const [stored] = useState<AdSize | null>(() =>
    width && height ? { width, height } : null,
  );
  const [sizeSource, setSizeSource] = useState<AdSizeSource>(
    stored ? "stored" : "none",
  );
  const [natural, setNatural] = useState<AdSize | null>(null);
  // Eski görselin geç gelen yüklemesi yeni görselin boyutunu ezmesin.
  const currentUrl = useRef(imageUrl);

  const setDims = useCallback(
    (w: number, h: number) => {
      setValue("width", w, { shouldDirty: true });
      setValue("height", h, { shouldDirty: true });
    },
    [setValue],
  );

  useEffect(() => {
    const next = sizeAfterContextChange({
      position,
      platform,
      state: {
        size: { width: width || 0, height: height || 0 },
        source: sizeSource,
      },
      natural,
      stored,
    });
    if (next.source === sizeSource) return;
    setSizeSource(next.source);
    setDims(next.size.width, next.size.height);
  }, [position, platform, width, height, sizeSource, natural, stored, setDims]);

  const loadDims = useCallback(
    (url: string) => {
      const img = new window.Image();
      img.onload = () => {
        if (currentUrl.current !== url) return;
        const size = { width: img.naturalWidth, height: img.naturalHeight };
        setNatural(size);
        setSizeSource("image");
        setDims(size.width, size.height);
      };
      img.onerror = () => {
        if (currentUrl.current !== url) return;
        setNatural(null);
        // Yüklenemeyen görselin boyutu geçerli değil: kayıtlı boyuta dön.
        const fb = fallbackSize(null, stored);
        setSizeSource(fb.source);
        setDims(fb.size.width, fb.size.height);
      };
      img.src = url;
    },
    [setDims, stored],
  );

  const applyImage = (url: string) => {
    currentUrl.current = url;
    setValue("imageUrl", url, { shouldDirty: true });
    if (url) loadDims(url);
    else {
      setNatural(null);
      setSizeSource("none");
      setDims(0, 0);
    }
  };

  const requestImage = (url: string) => {
    if (url === imageUrl) return;
    if (imageUrl && hotspotCount > 0) {
      setPendingUrl(url);
      return;
    }
    applyImage(url);
  };

  const confirmImage = () => {
    if (pendingUrl === null) return;
    setValue("hotspots", [], { shouldDirty: true });
    applyImage(pendingUrl);
    setPendingUrl(null);
  };

  const cancelImage = () => {
    setPendingUrl(null);
    setUrlDraft(imageUrl);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const res = await adminApi.uploadAdImage(file);
      const url = res.data?.url;
      if (!url) {
        toast.error(t("admin.marketing.ads.upload.failed"));
        return;
      }
      requestImage(url);
      toast.success(t("admin.marketing.ads.upload.success"));
    } catch (error) {
      toast.error(
        extractErrorMessage(error, t("admin.marketing.ads.upload.failed")),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm text-muted">
        {t("admin.marketing.ads.image")}
      </span>
      {imageUrl ? (
        <Panel className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={t("admin.marketing.ads.preview")}
            className="mx-auto max-h-48 rounded object-contain"
          />
          {width && height ? (
            <div className="text-sm text-muted">
              {width} x {height} px
            </div>
          ) : null}
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={() => requestImage("")}
          >
            {t("admin.marketing.ads.removeImage")}
          </Button>
        </Panel>
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
        value={urlDraft}
        onChange={(e) => setUrlDraft(e.target.value)}
        onBlur={() => requestImage(urlDraft.trim())}
        placeholder={t("admin.marketing.ads.upload.urlPlaceholder")}
      />

      <AdSizePresets
        position={position}
        platform={platform}
        size={{ width: width || 0, height: height || 0 }}
        natural={natural}
        stored={stored}
        onPick={(picked, source) => {
          setSizeSource(source);
          setDims(picked.width, picked.height);
        }}
      />

      {(errors.width || errors.height) && (
        <Alert variant="danger">
          {t("admin.marketing.ads.validation.sizeMax")}
        </Alert>
      )}

      <ConfirmDialog
        isOpen={pendingUrl !== null}
        onClose={cancelImage}
        onConfirm={confirmImage}
        title={t("admin.marketing.ads.hotspots.replaceTitle")}
        description={t("admin.marketing.ads.hotspots.replaceBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        destructive
      />
    </div>
  );
}

/**
 * Görselli reklamda tıklama yalnız alanlardadır: reklam bağlantısı gizlenir,
 * alan editörü gösterilir. Görselsiz (yalnız metin) reklamda bağlantı alanı.
 */
function LinkOrHotspotsField() {
  const t = useTranslations();
  const { setValue, formState } = useFormContext<AdFormValues>();
  const imageUrl = useWatch({ name: "imageUrl" }) as string;
  const hotspots = (useWatch({ name: "hotspots" }) ??
    []) as AdFormValues["hotspots"];

  if (!imageUrl) {
    return (
      <FormInput
        name="linkUrl"
        label={t("admin.marketing.ads.linkUrl")}
        placeholder={t("admin.marketing.ads.linkUrlPlaceholder")}
        helperText={t("admin.marketing.ads.linkUrlHelper")}
      />
    );
  }
  return (
    <HotspotEditor
      imageUrl={imageUrl}
      value={hotspots}
      onChange={(next) => setValue("hotspots", next, { shouldDirty: true })}
      issues={formState.isSubmitted ? hotspotIssues(t, hotspots) : []}
    />
  );
}

/** Pozisyon seçici + seçilen yerin tek satırlık açıklaması ve önerilen boyutlar. */
function PositionField() {
  const t = useTranslations();
  const position = useWatch({ name: "position" }) as string;
  return (
    <FormSelect
      name="position"
      label={t("admin.marketing.ads.positionLabel")}
      options={positionOptions(t)}
      helperText={positionHint(t, position)}
    />
  );
}

/** Yalnız popup yuvasında: kapatılana kadar mı, her girişte mi açılsın. */
function PopupFrequencyField() {
  const t = useTranslations();
  const position = useWatch({ name: "position" }) as string;
  if (position !== "popup") return null;
  return (
    <FormSelect
      name="popupFrequency"
      label={t("admin.marketing.ads.popupFrequencyLabel")}
      options={popupFrequencyOptions(t)}
      helperText={t("admin.marketing.ads.popupFrequencyHelper")}
    />
  );
}

/** Opsiyonel kampanya bağlantısı: yalnız aktif/yaklaşan kampanyalar seçilebilir. */
function CampaignField({ currentId }: { currentId?: string | null }) {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: adminKeys.options("discounts"),
    queryFn: async () =>
      unwrapCampaigns((await adminApi.getDiscounts({ limit: 200 })).data),
    staleTime: 60_000,
  });
  const campaigns = selectableCampaigns(data ?? [], new Date(), currentId);
  return (
    <FormSelect
      name="discountId"
      label={t("admin.marketing.ads.campaign")}
      options={[
        { value: "", label: t("admin.marketing.ads.noCampaign") },
        ...campaigns.map((c) => ({ value: c.id, label: campaignLabel(c) })),
      ]}
      helperText={t("admin.marketing.ads.campaignHelper")}
    />
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
        ? adminApi.updateAd(ad!.id, adFormToPayload(v, "update"))
        : adminApi.createAd(adFormToPayload(v, "create")),
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
      <LinkOrHotspotsField />
      <FormTextarea
        name="content"
        label={t("admin.marketing.ads.content")}
        placeholder={t("admin.marketing.ads.contentPlaceholder")}
        helperText={t("admin.marketing.ads.contentHelper")}
        maxLength={AD_CONTENT_MAX}
        rows={3}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PositionField />
        <FormSelect
          name="platform"
          label={t("admin.marketing.ads.platformLabel")}
          options={platformOptions(t)}
        />
      </div>
      <PopupFrequencyField />
      <FormInput
        name="displayOrder"
        label={t("admin.marketing.ads.displayOrder")}
        type="number"
        placeholder="0"
        helperText={t("admin.marketing.ads.displayOrderHelper")}
      />
      <CampaignField currentId={ad?.discountId} />
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
