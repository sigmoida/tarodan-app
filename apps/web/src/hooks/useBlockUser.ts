"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWebMutation } from "./useWebMutation";

/**
 * Engel sonrası tazelenecek query kökleri: engellenen kişinin ilanları
 * akış/vitrin/arama/benzer üründen, konuları mesaj listesinden, koleksiyonları
 * keşiften düşer; profil 404'e döner; sunucu iki yönlü takibi sildiği için
 * takip durumu/listesi de tazelenir. Mobil `useBlockUser` ile aynı küme.
 */
const BLOCK_INVALIDATES = [
  "blocked-users",
  "block-status",
  "listings",
  "featured-rail",
  "home",
  "autocomplete-rich",
  "message-threads",
  "messages-unread-count",
  "seller",
  "seller-products",
  "seller-collections",
  "follow",
  "profile-following",
  "collections",
  "collection",
  "wishlist",
];

/** Hedef kullanıcıyı engelledim mi? Yalnız giriş yapmış ve kendisi değilse sorar. */
export function useBlockStatus(targetUserId?: string) {
  const { isAuthenticated, user } = useAuthStore();
  const enabled =
    !!targetUserId && !!isAuthenticated && user?.id !== targetUserId;
  const query = useQuery({
    queryKey: queryKeys.blocks.status(targetUserId ?? ""),
    queryFn: async () =>
      (await userApi.getBlockStatus(targetUserId!)).data.blocked,
    enabled,
    meta: { page: "block-status" },
  });
  return {
    isBlocked: query.data ?? false,
    isLoading: enabled && query.isLoading,
  };
}

/**
 * Engelle / engeli kaldır — onay diyaloğu, toast ve invalidation tek yerde.
 * `requireAuth` verilmezse giriş kapısı çağıranın sorumluluğundadır.
 */
export function useBlockUser(options?: {
  requireAuth?: () => boolean;
  onBlocked?: () => void;
  onUnblocked?: () => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();

  const blockMutation = useWebMutation(
    ({ userId }: { userId: string; name: string }) => userApi.block(userId),
    {
      invalidates: BLOCK_INVALIDATES,
      onSuccess: (_data, vars) => {
        toast.success(t("profile.blockedToast", { name: vars.name }));
        options?.onBlocked?.();
      },
      errorMessage: t("profile.blockFailed"),
    },
  );

  const unblockMutation = useWebMutation(
    ({ userId }: { userId: string; name?: string }) => userApi.unblock(userId),
    {
      invalidates: BLOCK_INVALIDATES,
      successMessage: t("profile.unblockedToast"),
      onSuccess: () => options?.onUnblocked?.(),
    },
  );

  const requestBlock = async (userId: string, name: string) => {
    if (options?.requireAuth && !options.requireAuth()) return;
    const ok = await confirm({
      title: t("profile.blockConfirmTitle", { name }),
      description: t("profile.blockConfirmBody"),
      confirmLabel: t("profile.block"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    await blockMutation.mutateAsync({ userId, name }).catch(() => undefined);
  };

  const requestUnblock = async (userId: string, name?: string) => {
    if (options?.requireAuth && !options.requireAuth()) return;
    await unblockMutation.mutateAsync({ userId, name }).catch(() => undefined);
  };

  return {
    requestBlock,
    requestUnblock,
    pending: blockMutation.isPending || unblockMutation.isPending,
  };
}
