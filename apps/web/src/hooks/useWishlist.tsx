/** @format */

"use client";

import { useCallback, useMemo } from "react";
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HeartIcon } from "@heroicons/react/24/outline";
import { wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  wishlistIdSet,
  wishlistItemsQuery,
  settleWishlistEntry,
  wishlistEntryFrom,
  withWishlistEntry,
  type WishlistEntry,
  type WishlistRestore,
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
 *
 * İsteği süren ürünler `useWishlistPendingIds` ile okunur; düğmeler o sürede
 * `favoriteBusyProps` (`lib/favorite-busy`) ile meşgul görünür.
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
  /** Çıkarılan asıl satır ve eski yeri — hata olursa oraya geri konur. */
  removed?: WishlistRestore;
}

/** Toggle mutation'ının ürünü (yapısal tip: hem filtre hem `select` alır). */
const toggledProductId = (mutation: { state: { variables?: unknown } }) =>
  (mutation.state.variables as ToggleVars | undefined)?.productId;

/** Tek ürünün toggle mutation'larını seçen filtre — kalp ve çift tık koruması. */
const toggleFilterFor = (productId: string) => ({
  mutationKey: TOGGLE_KEY,
  predicate: (mutation: { state: { variables?: unknown } }) =>
    toggledProductId(mutation) === productId,
});

/**
 * Bu ürün için favori isteği sürüyor mu? Aynı ürün için ikinci tıklama
 * `toggle` tarafından yok sayılır; kalp bu sürede meşgul görünür ki tıklama
 * SESSİZCE düşmüş gibi durmasın. Kart başına yalnız bir sayı okunur (küme yok).
 */
export function useIsWishlistPending(productId: string): boolean {
  return useIsMutating(toggleFilterFor(productId)) > 0;
}

/**
 * İsteği süren TÜM favori ürünleri — liste ekranı (Favorilerim) için, sayfa
 * başına tek abonelik. Tek ürün için `useIsWishlistPending` kullanılır.
 */
export function useWishlistPendingIds(): ReadonlySet<string> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_KEY, status: "pending" },
    select: toggledProductId,
  });
  return useMemo(
    () => new Set(pending.filter((id): id is string => !!id)),
    [pending],
  );
}

/**
 * Favori ekle/çıkar. Döndürdüğü `toggle(productId, isFavorite)`:
 *
 * - Önbellekteki listeyi HEMEN günceller (kalp anında dolar/boşalır); hata
 *   olursa yalnız o ürünü geri alır — eşzamanlı başka bir toggle'ı ezmez.
 * - Aynı ürün için bir istek sürerken ikinci tıklamayı yok sayar (`false`
 *   döner); düğme o sürede `useIsWishlistPending` ile meşgul görünür.
 * - Ekleme bitince geçici satırı sunucunun satırıyla değiştirir; tazeleme
 *   düşse de kalıcı bir yükleniyor kartı kalmaz.
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

  const { mutate } = useMutation<
    WishlistEntry | undefined,
    unknown,
    ToggleVars,
    ToggleContext
  >({
    mutationKey: TOGGLE_KEY,
    mutationFn: async ({ productId, add }) => {
      try {
        if (!add) {
          await wishlistApi.remove(productId);
          return undefined;
        }
        // Eklenen satır (varsa) geçici satırın yerine konur.
        return wishlistEntryFrom((await wishlistApi.add(productId)).data);
      } catch (error) {
        // İstenen son durum zaten sunucuda: eklerken 409 (zaten favoride),
        // çıkarırken 404 (zaten favoride değil) → BAŞARI: kalp geri
        // alınmaz, kullanıcı başarı mesajını görür.
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status === (add ? 409 : 404)) return undefined;
        throw error;
      }
    },
    onMutate: async ({ productId, add }) => {
      // Uçuştaki bir liste isteği iyimser değeri ezmesin.
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const list = queryClient.getQueryData<WishlistEntry[]>(LIST_KEY);
      const index = add
        ? -1
        : (list?.findIndex((item) => item.productId === productId) ?? -1);
      const removed =
        list && index >= 0 ? { entry: list[index], index } : undefined;
      queryClient.setQueryData<WishlistEntry[]>(
        LIST_KEY,
        (old) => old && withWishlistEntry(old, productId, add),
      );
      return { removed };
    },
    onSuccess: (entry, { productId, add }) => {
      if (add) {
        queryClient.setQueryData<WishlistEntry[]>(
          LIST_KEY,
          (old) => old && settleWishlistEntry(old, productId, entry),
        );
      }
      successToast(add);
    },
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
      // Önbellekten EŞZAMANLI okunur: aynı tick'teki çift tıklama henüz
      // render olmamış `useIsWishlistPending`'i göremez.
      if (queryClient.isMutating(toggleFilterFor(productId)) > 0) return false;
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
 * iyimser toggle. Kart ve ilan detayı aynı akışı buradan alır; `isPending`
 * istek sürerken kalbi meşgul gösterir (`favoriteBusyProps`).
 */
export function useProductFavorite(
  productId: string,
  { isOwner, requireAuth }: ProductFavoriteOptions,
) {
  const t = useTranslations();
  const isFavorite = useWishlistIds().has(productId);
  const isPending = useIsWishlistPending(productId);
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

  return { isFavorite, isPending, toggle };
}
