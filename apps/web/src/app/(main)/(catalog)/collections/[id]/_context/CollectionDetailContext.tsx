/** @format */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { HeartIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "@/i18n";
import { collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useConfirm } from "@/components/ConfirmProvider";
import { isUUID, sortCollectionItems, type Collection } from "../_lib/types";

function useCollectionDetailValue() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { requireAuth, authModal } = useAuthGate();
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const collectionIdOrSlug = params.id as string;
  const collectionKey = queryKeys.collection.detail(collectionIdOrSlug);

  const [showAddModal, setShowAddModal] = useState(false);
  const slugReplacedRef = useRef(false);

  const collectionQuery = useQuery({
    queryKey: collectionKey,
    queryFn: async (): Promise<Collection> => {
      const response = isUUID(collectionIdOrSlug)
        ? await collectionsApi.getOne(collectionIdOrSlug)
        : await collectionsApi.getBySlug(collectionIdOrSlug);
      return response.data.collection || response.data;
    },
    enabled: !!collectionIdOrSlug,
    meta: { page: "collection-detail" },
  });

  const collection = collectionQuery.data ?? null;
  const isLoading = collectionQuery.isLoading;
  const isLiked = collection?.isLiked ?? false;
  const isOwner = user?.id === collection?.userId;
  const sortedItems = useMemo(
    () => sortCollectionItems(collection?.items),
    [collection?.items],
  );

  const error = useMemo(() => {
    if (!collectionIdOrSlug) return t("collection.invalidLink");
    if (!collectionQuery.isError) return null;
    const status = (collectionQuery.error as any)?.response?.status;
    if (status === 400) return t("collection.invalidLink");
    if (status === 403) return t("collection.privateCollection");
    if (status === 404) return t("collection.collectionNotFound");
    return t("collection.loadFailed");
  }, [collectionIdOrSlug, collectionQuery.isError, collectionQuery.error, t]);

  // Came in via slug → rewrite the address bar to the canonical /collections/{id}.
  useEffect(() => {
    if (!collectionIdOrSlug) return;
    if (isUUID(collectionIdOrSlug)) {
      slugReplacedRef.current = false;
      return;
    }
    if (!collection?.id || slugReplacedRef.current) return;
    slugReplacedRef.current = true;
    queryClient.setQueryData(
      queryKeys.collection.detail(collection.id),
      collection,
    );
    const idPath = `/collections/${collection.id}`;
    router.replace(idPath, { scroll: false });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.history.replaceState(null, "", idPath);
      });
    }
  }, [collection, collectionIdOrSlug, queryClient, router]);

  const invalidateCollection = () =>
    queryClient.invalidateQueries({ queryKey: collectionKey });

  const likeMutation = useMutation({
    mutationFn: () => collectionsApi.like(collection!.id),
    onSuccess: async () => {
      toast.success(isLiked ? t("collection.unliked") : t("collection.liked"));
      await Promise.all([
        invalidateCollection(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.collectionsLiked.list(),
        }),
      ]);
    },
    onError: (err: any) => {
      if (err?.response?.status === 404)
        toast.error(t("collection.collectionNotFound"));
      else
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            t("collection.likeFailed"),
        );
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      collectionsApi.removeItem(collection!.id, itemId),
    onSuccess: async () => {
      toast.success(t("collection.productRemoved"));
      await invalidateCollection();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to remove item:", error);
      toast.error(t("collection.productRemoveFailed"));
    },
  });

  const handleLike = () => {
    requireAuth(
      {
        title: t("collection.loginToLike"),
        message: t("collection.loginToLikeMsg"),
        icon: <HeartIcon className="h-10 w-10 text-primary-500" />,
        redirectPath: collection?.id
          ? `/collections/${collection.id}`
          : `/collections/${collectionIdOrSlug}`,
      },
      () => {
        if (!collection?.id) {
          toast.error(t("collection.collectionInfoNotFound"));
          return;
        }
        likeMutation.mutate();
      },
    );
  };

  const handleShare = async () => {
    if (!collection) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: collection.name, url });
        return;
      } catch {
        // cancelled / unsupported → fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("collection.linkCopied"));
    } catch {
      toast.error(t("common.copyFailed"));
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!collection) return;
    if (
      !(await confirm({
        title: locale === "en" ? "Remove product" : "Ürünü kaldır",
        description: t("collection.removeProductConfirm"),
        confirmLabel: locale === "en" ? "Remove" : "Kaldır",
        cancelLabel: t("common.cancel"),
        destructive: true,
      }))
    )
      return;
    removeItemMutation.mutate(itemId);
  };

  return {
    t,
    locale,
    router,
    collectionIdOrSlug,
    collection,
    isLoading,
    error,
    isOwner,
    isLiked,
    sortedItems,
    invalidateCollection,
    showAddModal,
    setShowAddModal,
    authModal,
    handleLike,
    handleShare,
    handleRemoveItem,
  };
}

type CollectionDetailValue = ReturnType<typeof useCollectionDetailValue>;

const CollectionDetailContext = createContext<CollectionDetailValue | null>(
  null,
);

export function CollectionDetailProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useCollectionDetailValue();
  return (
    <CollectionDetailContext.Provider value={value}>
      {children}
    </CollectionDetailContext.Provider>
  );
}

export function useCollectionDetail() {
  const ctx = useContext(CollectionDetailContext);
  if (!ctx)
    throw new Error(
      "useCollectionDetail must be used within a CollectionDetailProvider",
    );
  return ctx;
}
