/** @format */

"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HeartIcon } from "@heroicons/react/24/outline";
import { wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  wishlistIdSet,
  wishlistItemsQuery,
  withWishlistEntry,
  type WishlistEntry,
} from "@/lib/wishlist";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/hooks/useWebMutation";
import type { AuthGateConfig } from "@/hooks/useAuthGate";

/**
 * Favori (wishlist) mantığının tek yeri — ürün kartlarındaki kalp ve ilan
 * detayındaki kalp aynı üç hook'u kullanır:
 *
 * - `useWishlistIds`   → kullanıcının favori ürün id'leri (tek sorgu, `Set`).
 * - `useToggleWishlist` → iyimser ekle/çıkar + geri alma + toast.
 * - `useProductFavorite` → bir ürün için misafir / sahip / toggle akışı.
 */

const EMPTY_IDS: ReadonlySet<string> = new Set();
const LIST_KEY = queryKeys.wishlist.all();
const TOGGLE_KEY = queryKeys.wishlist.toggle();

/**
 * Favori ürün id'leri. Misafirde sorgu HİÇ atılmaz ve boş küme döner — sorgu
 * kapalıyken önbellekte önceki oturumdan kalan bir liste olsa bile. Liste
 * `wishlistItemsQuery` ile header rozetiyle aynı önbellek girdisidir; `select`
 * yalnız kümeyi türetir.
 */
export function useWishlistIds(): ReadonlySet<string> {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    ...wishlistItemsQuery,
    enabled: isAuthenticated,
    select: wishlistIdSet,
    meta: { page: "wishlist-ids" },
  });
  return isAuthenticated ? (data ?? EMPTY_IDS) : EMPTY_IDS;
}

interface ToggleVars {
  productId: string;
  /** true = favorilere ekle, false = favorilerden çıkar. */
  add: boolean;
}

interface ToggleContext {
  /** Çıkarılan asıl satır — hata olursa yerine geri konur. */
  removed?: WishlistEntry;
}

/**
 * Favori ekle/çıkar. Döndürdüğü `toggle(productId, isFavorite)`:
 *
 * - Önbellekteki listeyi HEMEN günceller (kalp anında dolar/boşalır); hata
 *   olursa yalnız o ürünü geri alır — eşzamanlı başka bir toggle'ı ezmez.
 * - Aynı ürün için bir istek sürerken ikinci tıklamayı yok sayar (`false` döner).
 * - Yalnız favori listesini (+ açıksa o ürünün detayını) tazeler; ürün
 *   listelerine ve kartlardaki `likeCount`'a dokunmaz.
 */
export function useToggleWishlist() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const successToast = (add: boolean) =>
    toast.success(
      add ? t("product.addedToFavorites") : t("product.removedFromFavorites"),
    );

  const { mutate } = useMutation<unknown, unknown, ToggleVars, ToggleContext>({
    mutationKey: TOGGLE_KEY,
    mutationFn: async ({ productId, add }) => {
      try {
        return await (add
          ? wishlistApi.add(productId)
          : wishlistApi.remove(productId));
      } catch (error) {
        // İstenen son durum zaten sunucuda: eklerken 409 (zaten favoride),
        // çıkarırken 404 (zaten favoride değil) → BAŞARI. Hata olarak
        // bırakılsaydı geri alma çalışır ve MutationCache onu Sentry'ye
        // beklenmeyen hata diye raporlardı.
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status === (add ? 409 : 404)) return undefined;
        throw error;
      }
    },
    onMutate: async ({ productId, add }) => {
      // Uçuştaki bir liste isteği iyimser değeri ezmesin.
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const removed = add
        ? undefined
        : queryClient
            .getQueryData<WishlistEntry[]>(LIST_KEY)
            ?.find((item) => item.productId === productId);
      queryClient.setQueryData<WishlistEntry[]>(
        LIST_KEY,
        (old) => old && withWishlistEntry(old, productId, add),
      );
      return { removed };
    },
    onSuccess: (_data, { add }) => successToast(add),
    // Sentry raporunu MutationCache yapar (lib/query/client); burada yalnız
    // geri alma ve kullanıcıya gösterilen hata var.
    onError: (error, { productId, add }, context) => {
      queryClient.setQueryData<WishlistEntry[]>(
        LIST_KEY,
        (old) =>
          old && withWishlistEntry(old, productId, !add, context?.removed),
      );
      toast.error(apiErrorMessage(error) ?? t("common.operationFailed"));
    },
    onSettled: (_data, _error, { productId }) => {
      // Başka bir ürünün isteği hâlâ sürüyorsa listeyi şimdi tazelemek onun
      // iyimser değerini geçici olarak geri alır — sonuncu biten tazeler.
      // (onSettled sırasında bu mutation henüz "pending" sayılır: 1 = yalnız biz.)
      if (queryClient.isMutating({ mutationKey: TOGGLE_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.product.detail(productId),
      });
    },
  });

  return useCallback(
    (productId: string, isFavorite: boolean): boolean => {
      const inFlight = queryClient.isMutating({
        mutationKey: TOGGLE_KEY,
        predicate: (mutation) =>
          (mutation.state.variables as ToggleVars | undefined)?.productId ===
          productId,
      });
      if (inFlight > 0) return false;
      mutate({ productId, add: !isFavorite });
      return true;
    },
    [mutate, queryClient],
  );
}

export interface ProductFavoriteOptions {
  /** Ürün oturumdaki kullanıcının mı? (kendi ürünü favorilenemez) */
  isOwner: boolean;
  /** `useAuthGate().requireAuth` — misafirde giriş penceresini açar. */
  requireAuth: (cfg: AuthGateConfig) => boolean;
}

/**
 * Tek bir ürünün favori durumu ve kalp tıklaması. Misafire giriş penceresi,
 * sahibine "kendi ürününüzü favorilere ekleyemezsiniz" uyarısı, diğerlerine
 * iyimser toggle. Kart ve ilan detayı aynı akışı buradan alır.
 */
export function useProductFavorite(
  productId: string,
  { isOwner, requireAuth }: ProductFavoriteOptions,
) {
  const t = useTranslations();
  const isFavorite = useWishlistIds().has(productId);
  const toggleWishlist = useToggleWishlist();

  const toggle = useCallback(() => {
    if (
      !requireAuth({
        title: t("product.addToFavorites"),
        message: t("auth.memberBenefits"),
        icon: <HeartIcon className="w-10 h-10 text-danger-500" />,
      })
    )
      return;
    if (isOwner) {
      toast.error(t("product.cannotFavoriteOwn"));
      return;
    }
    toggleWishlist(productId, isFavorite);
  }, [requireAuth, isOwner, toggleWishlist, productId, isFavorite, t]);

  return { isFavorite, toggle };
}
