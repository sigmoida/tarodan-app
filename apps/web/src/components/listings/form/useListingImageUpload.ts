/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import toast from "react-hot-toast";
import { mediaApi } from "@/lib/api";
import {
  acceptFiles,
  hasPendingUploads,
  itemFromExisting,
  itemFromFile,
  makeCover as makeCoverAt,
  moveItem as moveItemAt,
  patchItem,
  removeItem as removeItemById,
  toFormImages,
  type ListingImageItem,
  type RejectedFile,
} from "./listing-image-item";

export type { ListingImageItem } from "./listing-image-item";

/** Geriye uyum: form alanının eleman tipi. */
export interface ListingImage {
  cardKey: string;
  detailKey: string;
}

interface UseListingImageUploadParams {
  /** `images: ListingImage[]` alanına sahip form. */
  form: UseFormReturn<any>;
  /** Üyeliğe göre izin verilen görsel adedi. */
  maxImages: number;
}

const rejectionMessage = (rejected: RejectedFile[]): string => {
  const byReason = {
    type: rejected.filter((r) => r.reason === "type"),
    size: rejected.filter((r) => r.reason === "size"),
    duplicate: rejected.filter((r) => r.reason === "duplicate"),
    limit: rejected.filter((r) => r.reason === "limit"),
  };
  const parts: string[] = [];
  if (byReason.type.length)
    parts.push(`${byReason.type.length} dosya desteklenmeyen biçimde`);
  if (byReason.size.length)
    parts.push(`${byReason.size.length} dosya 10 MB sınırının üstünde`);
  if (byReason.duplicate.length)
    parts.push(`${byReason.duplicate.length} dosya zaten eklenmiş`);
  if (byReason.limit.length)
    parts.push(`${byReason.limit.length} dosya kontenjana sığmadı`);
  return `${parts.join(", ")} — eklenmedi`;
};

/**
 * İlan görsellerinin yükleme ve sıralama durumu.
 *
 * Ekranda görünen sıra TEK listedir (`items`); forma yazılan `images` alanı bu
 * listeden türetilir ve yalnız başarıyla yüklenmiş kalemleri içerir. Böylece
 * yarım kalmış ya da hata almış bir yükleme forma sızamaz.
 *
 * Bu sürümde yükleme hâlâ tek istekle yapılır; dosya bazlı kuyruk, ilerleme ve
 * iptal bir sonraki adımda gelir. Durum modeli o adımı taşıyacak şekilde
 * kurulmuştur (kalem başına `status`/`progress`).
 */
export function useListingImageUpload({
  form,
  maxImages,
}: UseListingImageUploadParams) {
  const [items, setItems] = useState<ListingImageItem[]>([]);

  // Object URL'ler unmount'ta serbest bırakılmalı; `items` state'i temizlik
  // anında bayat olmasın diye ref üzerinden okunur.
  const itemsRef = useRef<ListingImageItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.isObjectUrl) URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );

  /** Listeyi güncelle ve forma yazılacak yükü aynı anda tazele. */
  const commit = useCallback(
    (next: ListingImageItem[]) => {
      setItems(next);
      form.setValue("images", toFormImages(next), { shouldValidate: true });
    },
    [form],
  );

  /** Düzenleme ekranı: kayıtlı görselleri yükleme yapmadan yerleştirir. */
  const seedExistingImages = useCallback(
    (
      images: Array<{
        cardKey: string;
        detailKey: string;
        cardUrl?: string | null;
        detailUrl?: string | null;
      }>,
    ) => {
      commit(images.map(itemFromExisting));
    },
    [commit],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const current = itemsRef.current;
      const { accepted, rejected } = acceptFiles(current, files, { maxImages });

      if (rejected.length) toast.error(rejectionMessage(rejected));
      if (!accepted.length) return;

      const queued = accepted.map((file) =>
        itemFromFile(file, (f) => URL.createObjectURL(f)),
      );
      let next = [...current, ...queued];
      commit(next);

      // Tek istek: dosya bazlı kuyruk bir sonraki adımda.
      next = next.map((item) =>
        queued.some((q) => q.clientId === item.clientId)
          ? { ...item, status: "uploading", progress: 0 }
          : item,
      );
      commit(next);

      try {
        const response = await mediaApi.uploadProductImages(accepted);
        const uploaded: Array<{
          cardKey: string;
          detailKey: string;
          cardUrl?: string;
        }> = response.data;

        let done = itemsRef.current;
        queued.forEach((item, index) => {
          const result = uploaded[index];
          done = result
            ? patchItem(done, item.clientId, {
                status: "uploaded",
                progress: 100,
                cardKey: result.cardKey,
                detailKey: result.detailKey,
              })
            : patchItem(done, item.clientId, {
                status: "failed",
                error: "Sunucu bu dosya için sonuç döndürmedi",
              });
        });
        commit(done);
        toast.success(`${uploaded.length} resim başarıyla yüklendi`);
      } catch (error: any) {
        const message =
          error?.response?.data?.message || "Resim yükleme başarısız";
        let failed = itemsRef.current;
        for (const item of queued) {
          failed = patchItem(failed, item.clientId, {
            status: "failed",
            error: message,
          });
        }
        commit(failed);
        toast.error(message);
      }
    },
    [commit, maxImages],
  );

  /** `<input type=file>` ve sürükle-bırak aynı yola girer. */
  const handleFileUpload = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      void addFiles(Array.from(files));
    },
    [addFiles],
  );

  const removeImage = useCallback(
    (clientId: string) => {
      const target = itemsRef.current.find(
        (item) => item.clientId === clientId,
      );
      if (target?.isObjectUrl) URL.revokeObjectURL(target.previewUrl);
      commit(removeItemById(itemsRef.current, clientId));
    },
    [commit],
  );

  const moveImage = useCallback(
    (from: number, to: number) =>
      commit(moveItemAt(itemsRef.current, from, to)),
    [commit],
  );

  const makeCover = useCallback(
    (index: number) => commit(makeCoverAt(itemsRef.current, index)),
    [commit],
  );

  return {
    items,
    /** Kuyrukta/aktarımda kalem varken form gönderilmemeli. */
    uploadingImages: hasPendingUploads(items),
    seedExistingImages,
    handleFileUpload,
    removeImage,
    moveImage,
    makeCover,
  };
}
