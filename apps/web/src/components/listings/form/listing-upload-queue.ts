/** @format */

import type { ListingImageStatus } from "./listing-image-item";

/**
 * Dosya bazlı yükleme kuyruğu.
 *
 * Bütün dosyalar TEK istekle gönderiliyordu: tek bir dosyanın hatası bütün
 * partiyi düşürüyor, ortak bir "yükleniyor" bayrağından başka bir geri bildirim
 * olmuyor, iptal ve tekrar deneme mümkün olmuyordu. Artık her dosya kendi
 * isteğidir; biri düşerse diğerleri tamamlanır.
 *
 * React'ten bağımsızdır: `upload` portu dışarıdan verilir, bu yüzden kısmi
 * hata, iptal, eşzamanlılık sınırı ve ilerleme davranışı doğrudan test edilir.
 */

export interface UploadResult {
  cardKey: string;
  detailKey: string;
}

/** Tek dosyayı yükleyen port — iptal ve ilerleme desteklemek zorundadır. */
export type UploadPort = (
  file: File,
  options: {
    signal: AbortSignal;
    onProgress: (percent: number) => void;
  },
) => Promise<UploadResult>;

export interface QueueItem {
  clientId: string;
  file: File;
}

export interface QueueEvent {
  clientId: string;
  status: ListingImageStatus;
  progress?: number;
  result?: UploadResult;
  error?: string;
}

export interface UploadQueue {
  /** Kuyruğa ekle; boş slot varsa hemen başlar. */
  enqueue(items: QueueItem[]): void;
  /** Tek kalemi iptal et (aktifse isteği de durdurur). */
  cancel(clientId: string): void;
  /** Tümünü iptal et — unmount'ta çağrılır. */
  cancelAll(): void;
  /** Test/teşhis: o an aktif istek sayısı. */
  activeCount(): number;
}

export const DEFAULT_CONCURRENCY = 3;

const isAbortError = (error: unknown): boolean =>
  (error as { name?: string })?.name === "AbortError" ||
  (error as { code?: string })?.code === "ERR_CANCELED";

export function createUploadQueue(options: {
  upload: UploadPort;
  onEvent: (event: QueueEvent) => void;
  concurrency?: number;
}): UploadQueue {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const pending: QueueItem[] = [];
  const controllers = new Map<string, AbortController>();
  /** İptal edilenler: geç gelen sonuç/hata olayları bastırılmalı. */
  const cancelled = new Set<string>();
  let active = 0;

  const emit = (event: QueueEvent) => {
    if (cancelled.has(event.clientId)) return;
    options.onEvent(event);
  };

  const pump = () => {
    while (active < concurrency && pending.length > 0) {
      const item = pending.shift() as QueueItem;
      if (cancelled.has(item.clientId)) continue;
      void run(item);
    }
  };

  const run = async (item: QueueItem) => {
    active += 1;
    const controller = new AbortController();
    controllers.set(item.clientId, controller);
    emit({ clientId: item.clientId, status: "uploading", progress: 0 });

    try {
      const result = await options.upload(item.file, {
        signal: controller.signal,
        onProgress: (percent) => {
          // Baytlar bitti ama yanıt beklenirken "işleniyor": sunucu tarafında
          // moderasyon, Sharp dönüşümü ve depolama yüklemesi sürüyor. %100'ü
          // "hazır" göstermek sahte bir ilerleme olurdu.
          if (percent >= 100) {
            emit({
              clientId: item.clientId,
              status: "processing",
              progress: 100,
            });
            return;
          }
          emit({
            clientId: item.clientId,
            status: "uploading",
            progress: Math.max(0, Math.min(99, Math.round(percent))),
          });
        },
      });
      emit({
        clientId: item.clientId,
        status: "uploaded",
        progress: 100,
        result,
      });
    } catch (error) {
      // İptal bir hata değildir: kalem zaten listeden kaldırılıyor.
      if (!isAbortError(error) && !cancelled.has(item.clientId)) {
        emit({
          clientId: item.clientId,
          status: "failed",
          error: uploadErrorMessage(error),
        });
      }
    } finally {
      controllers.delete(item.clientId);
      active -= 1;
      // Bir dosyanın hatası kuyruğu durdurmaz.
      pump();
    }
  };

  return {
    enqueue(items) {
      for (const item of items) {
        cancelled.delete(item.clientId);
        pending.push(item);
        emit({ clientId: item.clientId, status: "queued", progress: 0 });
      }
      pump();
    },
    cancel(clientId) {
      cancelled.add(clientId);
      controllers.get(clientId)?.abort();
      const queuedIndex = pending.findIndex(
        (item) => item.clientId === clientId,
      );
      if (queuedIndex >= 0) pending.splice(queuedIndex, 1);
    },
    cancelAll() {
      for (const item of pending) cancelled.add(item.clientId);
      pending.length = 0;
      for (const [clientId, controller] of controllers) {
        cancelled.add(clientId);
        controller.abort();
      }
    },
    activeCount: () => active,
  };
}

export function uploadErrorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { message?: unknown } } })
    ?.response;
  const message = response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string")
    return message[0];
  return "Resim yüklenemedi";
}
