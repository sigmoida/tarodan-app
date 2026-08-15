"use client";

import { z } from "zod";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  FormModal,
  FormInput,
  FormTextarea,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { collectionsApi } from "@/lib/api";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import type { Translate } from "@/types/i18n";

const buildSchema = (t: Translate) =>
  z.object({
    name: z.string().trim().min(1, t("collection.nameRequired")),
    description: z.string().trim().optional().or(z.literal("")),
    categoryId: z.string().optional().or(z.literal("")),
    isPublic: z.boolean(),
  });
type CreateCollectionValues = z.infer<ReturnType<typeof buildSchema>>;

export default function CreateCollectionModal({
  onClose,
  onCreated,
  flatCategories,
}: {
  onClose: () => void;
  onCreated: (collectionId?: string) => void;
  flatCategories: { id: string; name: string; slug: string }[];
}) {
  const t = useTranslations();
  const modalLabels = useFormModalLabels();
  const form = useZodForm(buildSchema(t), {
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      isPublic: true,
    },
  });

  const onSubmit = async (v: CreateCollectionValues) => {
    try {
      const { data } = await collectionsApi.create({
        name: v.name,
        description: v.description,
        isPublic: v.isPublic,
        ...(v.categoryId ? { categoryId: v.categoryId } : {}),
      });
      onCreated(data?.id);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Create collection error:", error);
      toast.error(
        error.response?.data?.message || t("collection.createFailed"),
      );
      // Koleksiyon oluşturma izni üyelik katmanından gelir; API bunu 403 ile
      // reddeder. Sunucu mesajının metnine bakmak yerine durum koduna bakıyoruz
      // — mesaj artık isteğin dilinde döndüğü için metin eşleşmesi kırılırdı.
      if (error.response?.status === 403) {
        setTimeout(() => {
          window.location.href = "/membership";
        }, 2000);
      }
    }
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("collection.createNewCollection")}
      form={form}
      onSubmit={onSubmit}
      submitLabel={t("common.create")}
      size="md"
      {...modalLabels}
    >
      <FormInput
        name="name"
        label={t("collection.collectionName")}
        placeholder={t("collection.namePlaceholder")}
      />
      <FormTextarea
        name="description"
        label={t("collection.collectionDescription")}
        placeholder={t("collection.descriptionPlaceholder")}
        rows={3}
      />
      <FormSelect
        name="categoryId"
        label={t("common.category")}
        placeholder={t("collection.selectCategoryOptional")}
        options={flatCategories.map((c) => ({ value: c.id, label: c.name }))}
      />
      <FormCheckbox name="isPublic" label={t("collection.publicCollection")} />
    </FormModal>
  );
}
