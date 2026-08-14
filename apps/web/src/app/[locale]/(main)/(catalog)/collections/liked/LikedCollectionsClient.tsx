"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useAuthStore } from "@/stores/authStore";
import { collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Button } from "@tarodan/ui";
import CollectionCard from "../_components/CollectionCard";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  createdAt: string;
  userId?: string;
  userName?: string;
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  items?: {
    id: string;
    product: {
      id: string;
      title: string;
      images: { url: string }[];
    };
  }[];
}

export default function LikedCollectionsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const t = useTranslations();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) {
      router.push("/login?redirect=/collections/liked");
    }
  }, [mounted, isAuthenticated, authLoading, router]);

  const likedQuery = useQuery({
    queryKey: queryKeys.collectionsLiked.list(),
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getLiked();
      const data = response.data;
      return (
        data?.collections || data?.data || (Array.isArray(data) ? data : [])
      );
    },
    enabled: !authLoading && isAuthenticated,
    refetchOnMount: "always",
    meta: { page: "collections-liked" },
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) return false;
      return failureCount < 2;
    },
  });
  const collections = likedQuery.data ?? [];
  const loading = likedQuery.isLoading;
  const error = likedQuery.isError
    ? (likedQuery.error as any)?.response?.status === 401
      ? t("auth.sessionExpired")
      : t("collection.loadFailed")
    : null;

  useEffect(() => {
    if (
      (likedQuery.error as any)?.response?.status === 401 &&
      isAuthenticated
    ) {
      router.push("/login?redirect=/collections/liked");
    }
  }, [likedQuery.error, isAuthenticated, router]);

  const unlikeMutation = useMutation({
    mutationFn: (collectionId: string) => collectionsApi.unlike(collectionId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.collectionsLiked.list(),
      }),
    onError: (err: any) =>
      toast.error(err.response?.data?.message || t("collection.unlikeFailed")),
  });
  const handleUnlike = (collectionId: string) =>
    unlikeMutation.mutate(collectionId);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-dvh bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="animate-pulse text-muted text-sm">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface">
      {/* Page Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                <div className="w-1 h-6 bg-primary-500 rounded-sm" />
                {t("collection.likedCollections")}
              </h1>
              <p className="text-sm text-muted mt-0.5">
                {t("collection.likedCollectionsDesc")}
              </p>
            </div>
            <Link
              href="/profile"
              className="text-sm text-muted hover:text-body transition-colors flex items-center gap-1.5"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              {t("collection.backToProfile")}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
        {!mounted || !isAuthenticated || loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse"
              >
                <div className="aspect-square bg-border-subtle" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-border-subtle rounded w-3/4" />
                  <div className="h-3 bg-border-subtle rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-surface-elevated rounded border border-border">
            <p className="text-danger-500 text-sm mb-3">{error}</p>
            <Button
              variant="secondary"
              onClick={() => likedQuery.refetch()}
              className="px-4 py-2 bg-surface-alt hover:bg-border-subtle text-body rounded text-sm font-medium transition-colors"
            >
              {t("collection.tryAgain")}
            </Button>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-20 bg-surface-elevated rounded border border-border">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded mb-4">
              <BookOpenIcon className="w-7 h-7 text-subtle" />
            </div>
            <p className="text-muted text-lg font-medium mb-1">
              {t("collection.noLikedCollections")}
            </p>
            <p className="text-subtle text-sm mb-4">
              {t("collection.exploreTip")}
            </p>
            <Link
              href="/collections"
              className="inline-block px-5 py-2 bg-primary-500 hover:bg-primary-600 text-inverted rounded text-sm font-medium transition-colors"
            >
              {t("collection.exploreCollections")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {collections.map((collection, index) => (
              <motion.div
                key={collection.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <CollectionCard
                  collection={collection}
                  footer={
                    <Button
                      variant="secondary"
                      onClick={() => handleUnlike(collection.id)}
                      className="w-full bg-danger-50 hover:bg-danger-100 text-danger-500 rounded text-sm font-medium transition-colors"
                    >
                      {t("collection.unlike")}
                    </Button>
                  }
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
