import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useLocale, useTranslations } from "next-intl";
import type { Collection } from "../_lib/types";
import { isUUID } from "../_lib/constants";

export function useEditCollection() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const t = useTranslations();
  const collectionIdOrSlug = params.id as string;

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string>("");

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

  // Populate the form once, when the collection first arrives.
  const populatedRef = useRef(false);
  useEffect(() => {
    const data = collectionQuery.data;
    if (!data || populatedRef.current) return;
    populatedRef.current = true;
    setName(data.name || "");
    setDescription(data.description || "");
    setCategoryId(data.categoryId || "");
    setCoverImageUrl(data.coverImageUrl || "");
    setCoverImagePreview(data.coverImageUrl || "");
    setIsPublic(data.isPublic ?? true);
  }, [collectionQuery.data]);

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

  const coverMutation = useMutation({
    mutationFn: (file: File) =>
      collectionsApi.updateCover(collection!.id, file),
    onSuccess: (response) => {
      const newCoverUrl =
        response.data.collection?.coverImageUrl || response.data.coverImageUrl;
      if (newCoverUrl) {
        setCoverImageUrl(newCoverUrl);
        setCoverImagePreview(newCoverUrl);
        toast.success("Kapak resmi yüklendi");
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Kapak resmi yüklenemedi");
      setCoverImageFile(null);
      setCoverImagePreview(coverImageUrl);
    },
  });

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen geçerli bir resim dosyası seçin");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Resim boyutu 10MB'dan küçük olmalıdır");
      return;
    }
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
    coverMutation.mutate(file);
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      collectionsApi.update(collection!.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId || null,
        isPublic,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.collection.all(),
      });
      toast.success(t("collection.collectionUpdated"));
      router.push(`/collections/${collection!.id}`);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || t("collection.loadFailed")),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("collection.collectionNameRequired"));
      return;
    }
    if (!collection) {
      toast.error(t("collection.collectionNotFound"));
      return;
    }
    updateMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: () => collectionsApi.delete(collection!.id),
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
      toast.success(t("collection.collectionDeleted"));
      router.push("/collections");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || t("collection.loadFailed")),
  });

  const handleDelete = () => {
    if (!collection) {
      toast.error(t("collection.collectionNotFound"));
      return;
    }
    deleteMutation.mutate();
  };

  return {
    router,
    authLoading,
    isAuthenticated,
    user,
    collection,
    isLoading,
    error,
    isSaving: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    showDeleteModal,
    setShowDeleteModal,
    name,
    setName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    coverImagePreview,
    isUploadingCover: coverMutation.isPending,
    isPublic,
    setIsPublic,
    handleCoverImageChange,
    handleSubmit,
    handleDelete,
  };
}
