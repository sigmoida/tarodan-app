"use client";

import { z } from "zod";
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

const schema = z.object({
  name: z.string().trim().min(1, "İsim zorunlu"),
  description: z.string().trim().optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  isPublic: z.boolean(),
});
type CreateCollectionValues = z.infer<typeof schema>;

export default function CreateCollectionModal({
  onClose,
  onCreated,
  flatCategories,
}: {
  onClose: () => void;
  onCreated: (collectionId?: string) => void;
  flatCategories: { id: string; name: string; slug: string }[];
}) {
  const form = useZodForm(schema, {
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
      const errorMessage =
        error.response?.data?.message || "Koleksiyon oluşturulamadı";
      toast.error(errorMessage);
      if (
        errorMessage.includes("üyeliğiniz") ||
        errorMessage.includes("yetkiniz yok")
      ) {
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
      title="Yeni Koleksiyon"
      form={form}
      onSubmit={onSubmit}
      submitLabel="Oluştur"
      maxWidth="max-w-md"
    >
      <FormInput
        name="name"
        label="İsim"
        placeholder="Hot Wheels Koleksiyonum"
      />
      <FormTextarea
        name="description"
        label="Açıklama"
        placeholder="Koleksiyon hakkında..."
        rows={3}
      />
      <FormSelect
        name="categoryId"
        label="Kategori"
        placeholder="Kategori seçin (isteğe bağlı)"
        options={flatCategories.map((c) => ({ value: c.id, label: c.name }))}
      />
      <FormCheckbox name="isPublic" label="Herkese açık koleksiyon" />
    </FormModal>
  );
}
