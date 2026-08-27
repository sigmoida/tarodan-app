/** @format */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  imageSubmitBlocker,
  MAX_IMAGE_BYTES,
  MIN_IMAGE_BYTES,
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
import { canRotateFile, rotateImageFile } from "./rotate-image";

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

/**
 * Üretim portu: tek dosya, ilerleme ve iptal destekli.
 *
 * Hata metni karoda AYNEN gösterildiği için çeviriciyi dışarıdan alır; sabit
 * Türkçe bir mesaj `/en` kullanıcısına da Türkçe düşerdi.
 */
const createDefaultUpload =
  (t: Translate): UploadPort =>
  async (file, { signal, onProgress }) => {
    const response = await mediaApi.uploadProductImage(file, {
      signal,
      onProgress,
    });
    const [result] = response.data ?? [];
    if (!result?.cardKey || !result?.detailKey) {
      throw new Error(t("product.imageUpload.noServerResult"));
    }
    return { cardKey: result.cardKey, detailKey: result.detailKey };
  };

/** Red gerekçesi → katalog anahtarı. Sıra, kullanıcıya okunacak sıradır. */
const REJECTION_KEYS = [
  ["type", "product.imageUpload.rejectedType"],
  ["size", "product.imageUpload.rejectedSize"],
  ["tooSmall", "product.imageUpload.rejectedTooSmall"],
  ["duplicate", "product.imageUpload.rejectedDuplicate"],
  ["limit", "product.imageUpload.rejectedLimit"],
] as const;

/**
 * Genel (namespace'siz) çevirici. `ReturnType<typeof useTranslations>` TÜM
 * namespace'lerin birleşimini verdiği için tam yollu anahtarları kabul etmiyor;
 * `never` ile varsayılan (kök) namespace'e sabitlenir.
 */
type Translate = ReturnType<typeof useTranslations<never>>;

const rejectionMessage = (t: Translate, rejected: RejectedFile[]): string => {
  const parts = REJECTION_KEYS.flatMap(([reason, key]) => {
    const count = rejected.filter((r) => r.reason === reason).length;
    // Sınırlar metne gömülmez: sayılar kodda tek yerde tanımlı, katalog onları
    // ICU parametresi olarak alır.
    return count
      ? [
          t(key, {
            count,
            max: Math.round(MAX_IMAGE_BYTES / (1024 * 1024)),
            min: Math.round(MIN_IMAGE_BYTES / 1024),
          }),
        ]
      : [];
  });
  return t("product.imageUpload.rejectedSuffix", { reasons: parts.join(", ") });
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
  upload,
}: UseListingImageUploadParams) {
  const t = useTranslations();
  // Varsayılan port çeviriciye bağlı olduğu için burada kurulur; testler kendi
  // portlarını enjekte etmeye devam eder.
  const activeUpload = useMemo(
    () => upload ?? createDefaultUpload(t),
    [t, upload],
  );
  const [items, setItems] = useState<ListingImageItem[]>([]);
  /**
   * Kullanıcı görsellerde bir değişiklik yaptı mı?
   *
   * Form alanının kendisine GÜVENİLEMEZ: `setValue(..., shouldDirty: true)`
   * RHF'te "zorla kirlet" demek değildir — yeni değer varsayılanla
   * karşılaştırılır. Bekleyen bir yükleme sırasında forma yalnız `uploaded`
   * kalemler yazıldığı için `images` HENÜZ DEĞİŞMEZ ve `isDirty` false kalır.
   * Dosya seçiciden pencereye dönmek React Query'nin focus refetch'ini
   * tetiklediğinde, "temiz" görünen form sunucudaki eski görsellerle yeniden
   * doldurulup yüklenmekte olan görseli ekrandan siliyordu (nesne depoda
   * sahipsiz kalıyordu).
   *
   * Bu yüzden kullanıcı düzenlemesi AYRI tutulur ve payload'dan bağımsızdır.
   */
  const [hasUserImageEdits, setHasUserImageEdits] = useState(false);

  // Object URL'ler ve aktif istekler unmount'ta serbest bırakılmalı; `items`
  // state'i temizlik anında bayat olmasın diye ref üzerinden okunur.
  const itemsRef = useRef<ListingImageItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const formRef = useRef(form);
  formRef.current = form;
  // State güncellemesi asenkron; seed koruması aynı turda karar verebilmeli.
  const userEditsRef = useRef(false);
  /** O an düzenlenen kaydın kimliği — seed guard'ı buna bağlıdır. */
  const sessionRef = useRef<string | null>(null);

  /**
   * Listeyi güncelle ve forma yazılacak yükü aynı anda tazele.
   *
   * KULLANICININ yaptığı her değişiklik (ekleme, kaldırma, sıralama, kapak
   * seçme) hem formu kirletir hem `hasUserImageEdits` bayrağını kaldırır.
   * `shouldDirty` TEK BAŞINA yetmez: RHF yeni değeri varsayılanla
   * karşılaştırır ve bekleyen bir yükleme forma henüz yazılmadığı için
   * `images` değişmez. Sunucudan gelen mevcut görsellerin yerleştirilmesi ise
   * kullanıcı değişikliği DEĞİLDİR; ikisini de tetiklemez.
   */
  const commit = useCallback(
    (
      next: ListingImageItem[],
      { userEdit = true }: { userEdit?: boolean } = {},
    ) => {
      itemsRef.current = next;
      setItems(next);
      if (userEdit) {
        // Payload'dan BAĞIMSIZ bayrak: `shouldDirty` bekleyen yüklemede
        // form değerini değiştirmediği için tek başına yetmiyor.
        userEditsRef.current = true;
        setHasUserImageEdits(true);
      }
      formRef.current.setValue("images", toFormImages(next), {
        shouldValidate: true,
        shouldDirty: userEdit,
      });
    },
    [],
  );

  // Kuyruk bir KEZ kurulur: her render'da yeniden yaratılırsa aktif istekler
  // ve iptal denetleyicileri kaybolurdu.
  const uploadRef = useRef(activeUpload);
  uploadRef.current = activeUpload;
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

  /**
   * Düzenleme ekranı: kayıtlı görselleri yükleme yapmadan yerleştirir.
   *
   * `sessionId` DÜZENLENEN KAYDI tanımlar (ilan id'si). Guard ona bağlıdır:
   *
   *  - aynı kayıt + kullanıcı düzenlemesi → sunucudan gelen liste REDDEDİLİR
   *    (focus refetch'i bekleyen yüklemeyi ve değiştirilmiş sırayı ezmesin);
   *  - kayıt DEĞİŞTİYSE liste ZORUNLU olarak yenilenir.
   *
   * Kimliğe bağlamak şart: bu segmentte ilandan ilana geçerken bileşen
   * unmount OLMAYABİLİR. Oturumdan bağımsız bir bayrakla, A ilanında görsel
   * düzenleyen kullanıcı B ilanına geçtiğinde B'nin görselleri
   * yerleştirilemiyor ve B formunda A'nın görselleri kalıyordu.
   */
  const seedExistingImages = useCallback(
    (
      images: Array<{
        cardKey: string;
        detailKey: string;
        cardUrl?: string | null;
        detailUrl?: string | null;
      }>,
      sessionId?: string,
    ) => {
      const nextSession = sessionId ?? null;
      const isNewSession = sessionRef.current !== nextSession;

      if (!isNewSession) {
        // Guard çağıranda değil BURADA durur ki her çağıran hatırlamak
        // zorunda kalmasın.
        if (userEditsRef.current) return;
      } else {
        // Başka bir kayda geçildi: ÖNCEKİ kaydın devam eden yüklemeleri
        // iptal edilir ve önizleme URL'leri serbest bırakılır — aksi halde
        // eski ilanın yüklemesi yeni ilanın listesine düşerdi.
        queue.cancelAll();
        for (const item of itemsRef.current) {
          if (item.isObjectUrl) URL.revokeObjectURL(item.previewUrl);
        }
        userEditsRef.current = false;
        setHasUserImageEdits(false);
        sessionRef.current = nextSession;
      }

      // Sunucudan gelen kayıt — kullanıcı değişikliği değil.
      commit(images.map(itemFromExisting), { userEdit: false });
    },
    [commit, queue],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const current = itemsRef.current;
      const { accepted, rejected } = acceptFiles(current, files, { maxImages });

      if (rejected.length) toast.error(rejectionMessage(t, rejected));
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
    [commit, maxImages, queue, t],
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

  /**
   * Kalemi 90° çevirip YENİDEN yükler.
   *
   * Sunucu EXIF etiketini artık kendisi uyguluyor; bu düğme etiketi HİÇ
   * olmayan fotoğraflar içindir. Çevirmek dosyayı değiştirdiği için tek yol
   * yeniden yüklemektir — `retryImage` ile aynı kuyruk yolunu kullanır.
   */
  const rotateImage = useCallback(
    async (clientId: string) => {
      const target = itemsRef.current.find(
        (item) => item.clientId === clientId,
      );
      if (!target) return;

      // KAYITLI görselde tarayıcıda dosya yoktur, yalnız depodaki anahtar
      // vardır — çevirmeyi sunucu yapar ve YENİ anahtarlar döner. Yerel
      // dosyayı indirip canvas'a çekmek S3 tarafında CORS isterdi ve görseli
      // bir kez daha sıkıştırırdı.
      if (!target.file) {
        if (!target.detailKey) return;
        commit(
          patchItem(itemsRef.current, clientId, {
            status: "processing",
            progress: 0,
            error: undefined,
          }),
        );
        try {
          const { data } = await mediaApi.rotateProductImage(target.detailKey);
          commit(
            patchItem(itemsRef.current, clientId, {
              cardKey: data.cardKey,
              detailKey: data.detailKey,
              // Önizleme yeni nesneyi göstermeli; eskisi tarayıcı önbelleğinde
              // duruyor ve aynı URL kalsaydı çevrilmemiş hâli görünürdü.
              previewUrl: data.cardUrl,
              isObjectUrl: false,
              status: "uploaded",
              progress: 100,
            }),
          );
        } catch {
          commit(
            patchItem(itemsRef.current, clientId, {
              status: "uploaded",
              error: undefined,
            }),
          );
          toast.error(t("product.imageUpload.rotateFailed"));
        }
        return;
      }

      if (!canRotateFile(target.file)) return;

      // Kalem yüklenme ortasındaysa eski istek DURDURULUR; aksi halde çevrilen
      // görselin yanında eskisi de depoya inip çöp bırakırdı.
      queue.cancel(clientId);

      let rotated: File;
      try {
        rotated = await rotateImageFile(target.file);
      } catch {
        commit(
          patchItem(itemsRef.current, clientId, {
            status: "failed",
            progress: 0,
            error: t("product.imageUpload.rotateFailed"),
          }),
        );
        return;
      }

      // `await` sırasında liste değişmiş olabilir: kullanıcı kalemi kaldırmış
      // ya da başka bir ilana geçilmiş olabilir. Kalem artık yoksa yüklemeyi
      // BAŞLATMA — kaldırılmış bir görsel için depoya sahipsiz nesne inerdi.
      const current = itemsRef.current.find(
        (item) => item.clientId === clientId,
      );
      if (!current) return;

      if (current.isObjectUrl) URL.revokeObjectURL(current.previewUrl);
      commit(
        patchItem(itemsRef.current, clientId, {
          file: rotated,
          previewUrl: URL.createObjectURL(rotated),
          isObjectUrl: true,
          status: "queued",
          progress: 0,
          error: undefined,
          // Anahtarlar TEMİZLENMELİ: yoksa forma çevrilmemiş (yan) görselin
          // anahtarı yazılı kalırdı.
          cardKey: undefined,
          detailKey: undefined,
        }),
      );
      queue.enqueue([{ clientId, file: rotated }]);
    },
    [commit, queue, t],
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

  /**
   * Gönderim engeli + kullanıcıya gösterilecek metin. Saf model yalnız
   * `reason` döndürür; metin TEK yerde, katalogdan burada eklenir.
   */
  const submitBlocker = useMemo(() => {
    const blocker = imageSubmitBlocker(items);
    if (!blocker) return null;
    return {
      reason: blocker.reason,
      message:
        blocker.reason === "pending"
          ? t("product.imageUpload.blockerPending")
          : t("product.imageUpload.blockerFailed"),
    };
  }, [items, t]);

  return {
    items,
    /** Kuyrukta/aktarımda kalem varken form gönderilmemeli. */
    uploadingImages: hasPendingUploads(items),
    /** Gönderim engeli — yoksa null. */
    submitBlocker,
    /**
     * Kullanıcı görsellerde değişiklik yaptı mı? Düzenleme formu refetch
     * korumasında `formState.isDirty` ile BİRLİKTE kullanmalı: bekleyen
     * yükleme form değerini henüz değiştirmediği için isDirty yetmez.
     */
    hasUserImageEdits,
    seedExistingImages,
    handleFileUpload,
    removeImage,
    retryImage,
    rotateImage,
    moveImage,
    makeCover,
  };
}
