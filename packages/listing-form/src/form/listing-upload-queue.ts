/** @format */

import { isAbortError, throwIfAborted } from "./abort";
import type { ListingImageStatus } from "./listing-image-item";

/**
 * Dosya bazlı yükleme kuyruğu.
 *
 * Bütün dosyalar TEK istekle gönderiliyordu: tek bir dosyanın hatası bütün
 * partiyi düşürüyor, ortak bir "yükleniyor" bayrağından başka bir geri bildirim
 * olmuyor, iptal ve tekrar deneme mümkün olmuyordu. Artık her dosya kendi
 * isteğidir; biri düşerse diğerleri tamamlanır.
 *
 * React'ten bağımsızdır: `prepare` ve `upload` portları dışarıdan verilir, bu
 * yüzden kısmi hata, iptal, eşzamanlılık sınırı ve ilerleme davranışı
 * doğrudan test edilir.
 *
 * Hazırlık (tarayıcıda küçültme) slotun İÇİNDEDİR: eşzamanlılık sınırı onu da
 * kapsar ve kalem kaldırılınca aynı sinyal onu da durdurur.
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

/**
 * Dosyayı ağa çıkmadan önce hazırlayan port (yükleme öncesi küçültme). İptal
 * desteklemeli: sinyal iptal olursa `AbortError` ile reddetmeli ki kalem
 * kaldırıldığında kuyruk slotu beklemeden boşalsın.
 */
export type PreparePort = (
  file: File,
  options: { signal: AbortSignal },
) => Promise<File>;

export interface QueueItem {
  clientId: string;
  file: File;
  /**
   * Önceki denemede hazırlanmış (küçültülmüş) dosya. Verilirse hazırlık
   * ATLANIR: yeniden deneme aynı fotoğrafı bir kez daha çözüp kodlamasın.
   */
  prepared?: File;
}

export interface QueueEvent {
  clientId: string;
  status: ListingImageStatus;
  progress?: number;
  result?: UploadResult;
  error?: string;
  /**
   * `failed` olayında: bu denemede yüklenmeye çalışılan HAZIR dosya —
   * yalnız yeniden kullanılabiliyorsa (`canReusePrepared`). Çağıran onu
   * kalemde saklayıp yeniden denemede `QueueItem.prepared` olarak geri verir.
   */
  prepared?: File;
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

/** Hazırlık portu verilmezse dosya olduğu gibi yüklenir. */
const unprepared: PreparePort = (file) => Promise.resolve(file);

export function createUploadQueue(options: {
  /** Varsayılan: hazırlık yok (dosya olduğu gibi gider). */
  prepare?: PreparePort;
  upload: UploadPort;
  onEvent: (event: QueueEvent) => void;
  concurrency?: number;
}): UploadQueue {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const prepare = options.prepare ?? unprepared;
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
    const { signal } = controller;
    controllers.set(item.clientId, controller);
    emit({ clientId: item.clientId, status: "uploading", progress: 0 });

    let prepared = item.prepared;
    try {
      if (!prepared) {
        prepared = await prepare(item.file, { signal });
        // Hazırlık iptali dinlemese bile kaldırılan kalemin isteği başlamasın.
        throwIfAborted(signal);
      }
      const result = await options.upload(prepared, {
        signal,
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
          error: uploadErrorMessage(error) ?? undefined,
          prepared: canReusePrepared(error) ? prepared : undefined,
        });
      }
    } finally {
      // Aynı kalem bu arada yeniden kuyruğa girmiş olabilir (çevirme/yeniden
      // deneme): YENİ denemenin denetleyicisi silinmesin, yoksa iptal edilemez.
      if (controllers.get(item.clientId) === controller) {
        controllers.delete(item.clientId);
      }
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

/**
 * Başarısız denemenin hazır dosyası yeniden denemede kullanılabilir mi?
 *
 * Ağ hatası, 5xx, 408 ve 429'da dosyanın kendisinde sorun yok: aynısı tekrar
 * gönderilir, fotoğraf bir kez daha çözülüp kodlanmaz. Sunucu dosyayı 4xx ile
 * REDDETTİYSE (boyut, tür, moderasyon) sorun o dosyada olabilir: yeniden
 * deneme orijinalden yeniden hazırlar.
 */
export function canReusePrepared(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  if (typeof status !== "number") return true;
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Sunucunun (isteğin dilinde ürettiği) hata mesajı — yoksa `null`.
 *
 * Genel yedek metni BURADA üretilmez: bu saf yardımcı katalogtan okuyamaz, o
 * yüzden `null` döner ve gösterim tarafı kendi yerel metnine düşer.
 */
export function uploadErrorMessage(error: unknown): string | null {
  const response = (error as { response?: { data?: { message?: unknown } } })
    ?.response;
  const message = response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string")
    return message[0];
  return null;
}
