/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import toast from "react-hot-toast";
import { mediaApi } from "@/lib/api";
import {
  createUploadQueue,
  type QueueEvent,
  type UploadPort,
} from "./listing-upload-queue";
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
  /** Testler için değiştirilebilir yükleme portu. */
  upload?: UploadPort;
}

/** Üretim portu: tek dosya, ilerleme ve iptal destekli. */
const defaultUpload: UploadPort = async (file, { signal, onProgress }) => {
  const response = await mediaApi.uploadProductImage(file, {
    signal,
    onProgress,
  });
  const [result] = response.data ?? [];
  if (!result?.cardKey || !result?.detailKey) {
    throw new Error("Sunucu bu dosya için sonuç döndürmedi");
  }
  return { cardKey: result.cardKey, detailKey: result.detailKey };
};

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
  upload = defaultUpload,
}: UseListingImageUploadParams) {
  const [items, setItems] = useState<ListingImageItem[]>([]);

  // Object URL'ler ve aktif istekler unmount'ta serbest bırakılmalı; `items`
  // state'i temizlik anında bayat olmasın diye ref üzerinden okunur.
  const itemsRef = useRef<ListingImageItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const formRef = useRef(form);
  formRef.current = form;

  /** Listeyi güncelle ve forma yazılacak yükü aynı anda tazele. */
  const commit = useCallback((next: ListingImageItem[]) => {
    itemsRef.current = next;
    setItems(next);
    formRef.current.setValue("images", toFormImages(next), {
      shouldValidate: true,
    });
  }, []);

  // Kuyruk bir KEZ kurulur: her render'da yeniden yaratılırsa aktif istekler
  // ve iptal denetleyicileri kaybolurdu.
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const queueRef = useRef<ReturnType<typeof createUploadQueue> | null>(null);
  if (!queueRef.current) {
    const applyEvent = (event: QueueEvent) => {
      commit(
        patchItem(itemsRef.current, event.clientId, {
          status: event.status,
          ...(event.progress !== undefined ? { progress: event.progress } : {}),
          ...(event.result
            ? {
                cardKey: event.result.cardKey,
                detailKey: event.result.detailKey,
              }
            : {}),
          ...(event.status === "failed" ? { error: event.error } : {}),
        }),
      );
    };
    queueRef.current = createUploadQueue({
      upload: (file, options) => uploadRef.current(file, options),
      onEvent: applyEvent,
    });
  }
  const queue = queueRef.current;

  useEffect(
    () => () => {
      queue.cancelAll();
      for (const item of itemsRef.current) {
        if (item.isObjectUrl) URL.revokeObjectURL(item.previewUrl);
      }
    },
    [queue],
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
    (files: File[]) => {
      if (!files.length) return;
      const current = itemsRef.current;
      const { accepted, rejected } = acceptFiles(current, files, { maxImages });

      if (rejected.length) toast.error(rejectionMessage(rejected));
      if (!accepted.length) return;

      const queued = accepted.map((file) =>
        itemFromFile(file, (f) => URL.createObjectURL(f)),
      );
      commit([...current, ...queued]);
      queue.enqueue(
        queued.map((item) => ({
          clientId: item.clientId,
          file: item.file as File,
        })),
      );
    },
    [commit, maxImages, queue],
  );

  /** `<input type=file>` ve sürükle-bırak aynı yola girer. */
  const handleFileUpload = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      addFiles(Array.from(files));
    },
    [addFiles],
  );

  const removeImage = useCallback(
    (clientId: string) => {
      const target = itemsRef.current.find(
        (item) => item.clientId === clientId,
      );
      // Kaldırılan kalemin isteği DE durdurulmalı; aksi halde silinen görsel
      // arkada yüklenmeye devam edip depoda çöp bırakırdı.
      queue.cancel(clientId);
      if (target?.isObjectUrl) URL.revokeObjectURL(target.previewUrl);
      commit(removeItemById(itemsRef.current, clientId));
    },
    [commit, queue],
  );

  /** Hata alan kalemi yeniden kuyruğa alır. */
  const retryImage = useCallback(
    (clientId: string) => {
      const target = itemsRef.current.find(
        (item) => item.clientId === clientId,
      );
      if (!target?.file || target.status !== "failed") return;
      commit(
        patchItem(itemsRef.current, clientId, {
          status: "queued",
          progress: 0,
          error: undefined,
        }),
      );
      queue.enqueue([{ clientId, file: target.file }]);
    },
    [commit, queue],
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
    retryImage,
    moveImage,
    makeCover,
  };
}
