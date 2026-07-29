/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useZodForm } from "@tarodan/ui/form";
import { useAuthStore } from "@/stores/authStore";
import { collectionsApi } from "@/lib/api";
import { useWebMutation } from "@/hooks/useWebMutation";
import { queryKeys } from "@/lib/query/keys";
import { useTranslations } from "next-intl";
import type { Collection } from "../_lib/types";
import { isUUID } from "../_lib/constants";
import {
  collectionEditSchema,
  collectionToForm,
  emptyCollectionEditValues,
  type CollectionEditValues,
} from "../_lib/schema";

export function useEditCollection() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const t = useTranslations();
  const collectionIdOrSlug = params.id as string;

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const form = useZodForm(collectionEditSchema, {
    defaultValues: emptyCollectionEditValues,
  });

  // Auth gate.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) router.push("/login");
  }, [authLoading, isAuthenticated, user, router]);

  // Load the collection — same key the detail page uses, so its cache is reused.
  const collectionQuery = useQuery({
    queryKey: queryKeys.collection.detail(collectionIdOrSlug),
    queryFn: async (): Promise<Collection> => {
      const response = isUUID(collectionIdOrSlug)
        ? await collectionsApi.getOne(collectionIdOrSlug)
        : await collectionsApi.getBySlug(collectionIdOrSlug);
      return response.data.collection || response.data;
    },
    enabled: !authLoading && isAuthenticated && !!user && !!collectionIdOrSlug,
    meta: { page: "collection-edit" },
  });
  const collection = collectionQuery.data ?? null;

  // Seed the form once, when the collection first arrives.
  const populatedRef = useRef(false);
  useEffect(() => {
    const data = collectionQuery.data;
    if (!data || populatedRef.current) return;
    populatedRef.current = true;
    form.reset(collectionToForm(data));
  }, [collectionQuery.data, form]);

  const error = !collectionIdOrSlug
    ? t("collection.invalidLink")
    : collectionQuery.isError
      ? (collectionQuery.error as any)?.response?.data?.message ||
        t("collection.loadFailed")
      : collection && user && collection.userId !== user.id
        ? t("collection.noEditPermission")
        : null;

  const isLoading = !collectionIdOrSlug
    ? false
    : authLoading || collectionQuery.isPending;

  /** Immediate cover upload (its own endpoint); resolves the new URL for the
   *  shared FormImageUpload preview. Not re-sent on save. */
  const uploadCover = async (file: File): Promise<string> => {
    const res = await collectionsApi.updateCover(collection!.id, file);
    return res.data.collection?.coverImageUrl || res.data.coverImageUrl || "";
  };

  const save = useWebMutation(
    (values: CollectionEditValues) =>
      collectionsApi.update(collection!.id, {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        categoryId: values.categoryId || null,
        isPublic: values.isPublic,
      }),
    {
      successMessage: t("collection.collectionUpdated"),
      errorMessage: t("collection.loadFailed"),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.collection.all(),
        });
        router.push(`/collections/${collection!.id}`);
      },
    },
  );

  const del = useWebMutation(() => collectionsApi.delete(collection!.id), {
    successMessage: t("collection.collectionDeleted"),
    errorMessage: t("collection.loadFailed"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.collections.mine(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.collections.all(),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.collection.detail(collection!.id),
      });
      router.push("/collections");
    },
  });

  return {
    router,
    authLoading,
    isAuthenticated,
    user,
    collection,
    isLoading,
    error,
    form,
    onSubmit: (values: CollectionEditValues) => save.mutate(values),
    isSaving: save.isPending,
    uploadCover,
    del,
    handleDelete: () => del.mutate(),
    isDeleting: del.isPending,
    showDeleteModal,
    setShowDeleteModal,
  };
}
