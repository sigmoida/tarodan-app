/** @format */

/**
 * İlan görsellerinin TEK durum modeli.
 *
 * Eskiden iki paralel dizi vardı: form alanındaki `images` (yüklenmiş anahtarlar)
 * ve ayrı bir `imagePreviewUrls`. İkisi yalnızca INDEKS üzerinden eşleşiyordu, bu
 * yüzden aradan bir görsel silindiğinde ya da yüklemeler farklı sırayla
 * tamamlandığında önizleme ile anahtar birbirinden kopabiliyordu — kullanıcı bir
 * görsel görüp başkasını kaydedebiliyordu. Sürükleyerek sıralama ve paralel
 * yükleme eklenince bu kopma kaçınılmaz hâle gelirdi.
 *
 * Artık ekranda görünen sıra, tek bir `ListingImageItem[]` listesidir; forma
 * gidecek yük bu listeden TÜRETİLİR. React anahtarı olarak indeks değil
 * `clientId` kullanılır.
 */

export type ListingImageStatus =
  "queued" | "uploading" | "processing" | "uploaded" | "failed";

export interface ListingImageItem {
  /** Kalıcı istemci kimliği — React key ve kuyruk eşleşmesi bunun üzerinden. */
  clientId: string;
  /** Yüklenecek dosya; mevcut (kayıtlı) görsellerde yoktur. */
  file?: File;
  /** Gösterilecek önizleme: object URL ya da sunucudan gelen URL. */
  previewUrl: string;
  /** Önizleme `URL.createObjectURL` ile üretildiyse serbest bırakılmalı. */
  isObjectUrl: boolean;
  cardKey?: string;
  detailKey?: string;
  status: ListingImageStatus;
  /** 0-100, yalnız bayt aktarımı için. */
  progress: number;
  error?: string;
}

/** Forma yazılan görsel — API sözleşmesi (sıra authoritative). */
export interface ListingImagePayload {
  cardKey: string;
  detailKey: string;
}

export interface RejectedFile {
  name: string;
  reason: "type" | "size" | "duplicate" | "limit";
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

let counter = 0;
/** Çakışmaz istemci kimliği. `crypto.randomUUID` yoksa sayaca düşer (jsdom/eski tarayıcı). */
export function nextClientId(): string {
  counter += 1;
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `img-${counter}-${random}`;
}

/** Yeni seçilen dosyadan kuyruğa girecek kalem. */
export function itemFromFile(
  file: File,
  createObjectUrl: (file: File) => string,
): ListingImageItem {
  return {
    clientId: nextClientId(),
    file,
    previewUrl: createObjectUrl(file),
    isObjectUrl: true,
    status: "queued",
    progress: 0,
  };
}

/**
 * Kayıtlı (düzenleme ekranındaki) görsel. `uploaded` başlar ve YENİDEN
 * YÜKLENMEZ — düzenlemeye giren kullanıcı var olan görselleri tekrar
 * yüklemek zorunda kalmamalı.
 */
export function itemFromExisting(image: {
  cardKey: string;
  detailKey: string;
  cardUrl?: string | null;
  detailUrl?: string | null;
}): ListingImageItem {
  return {
    clientId: nextClientId(),
    previewUrl: image.cardUrl || image.detailUrl || image.cardKey,
    isObjectUrl: false,
    cardKey: image.cardKey,
    detailKey: image.detailKey,
    status: "uploaded",
    progress: 100,
  };
}

/**
 * Forma yazılacak yük: YALNIZ başarıyla yüklenmiş kalemler, EKRANDAKİ sırayla.
 *
 * Yükleme sırası kullanıcının belirlediği sırayı değiştirmez; bu yüzden sıra
 * listeden okunur, tamamlanma zamanından değil.
 */
export function toFormImages(items: ListingImageItem[]): ListingImagePayload[] {
  return items
    .filter(
      (item): item is ListingImageItem & ListingImagePayload =>
        item.status === "uploaded" && !!item.cardKey && !!item.detailKey,
    )
    .map((item) => ({ cardKey: item.cardKey, detailKey: item.detailKey }));
}

/** Kuyrukta ya da aktarımda olan kalem var mı? */
export function hasPendingUploads(items: ListingImageItem[]): boolean {
  return items.some(
    (item) =>
      item.status === "queued" ||
      item.status === "uploading" ||
      item.status === "processing",
  );
}

/**
 * Form GÖNDERİLEBİLİR mi? Gönderilemiyorsa gerekçesi de döner.
 *
 * Yalnız butonu kapatmak yetmez: Enter ile gönderim ve programatik çağrı da
 * aynı kapıdan geçmeli. Çözümlenmemiş görselle kaydedilen ilan, kullanıcının
 * ekranda gördüğünden EKSİK görselle yayınlanıyordu — forma yalnız `uploaded`
 * kalemler yazıldığı için sessizce düşüyorlardı.
 */
export function imageSubmitBlocker(
  items: ListingImageItem[],
): { reason: "pending" | "failed"; message: string } | null {
  if (hasPendingUploads(items)) {
    return {
      reason: "pending",
      message: "Görsel yüklemesi sürüyor, lütfen tamamlanmasını bekleyin.",
    };
  }
  if (items.some((item) => item.status === "failed")) {
    return {
      reason: "failed",
      message:
        "Yüklenemeyen görsel var. Tekrar deneyin ya da o görseli kaldırın.",
    };
  }
  return null;
}

/**
 * Kapak görseli = listenin ilk YÜKLENMİŞ kalemi.
 *
 * Sıradaki ilk kalem hata almışsa kapak sayılmamalı: forma yalnız `uploaded`
 * kalemler yazıldığı için kaydedilen kapak başka bir görsel olurdu ve ekranda
 * gösterilen kapak ile ilanda görünen kapak ayrışırdı.
 */
export function coverIndexOf(items: ListingImageItem[]): number {
  return items.findIndex((item) => item.status === "uploaded");
}

/** Kontenjan sayılırken başarısız kalemler yer kaplamaz — kullanıcı yerine yenisini koyabilmeli. */
export function occupiedSlots(items: ListingImageItem[]): number {
  return items.filter((item) => item.status !== "failed").length;
}

const fileFingerprint = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;

/**
 * Bırakılan/seçilen dosyaları kabul et — kalanları GEREKÇESİYLE döndür.
 *
 * Sessizce kırpmak yerine reddedilenleri açıkça bildirmek şart: kullanıcı 12
 * dosya bırakıp 3'ünün alındığını göremediğinde eksik ilan yayınlıyordu.
 */
export function acceptFiles(
  items: ListingImageItem[],
  files: File[],
  options: {
    maxImages: number;
    maxBytes?: number;
    acceptedTypes?: string[];
  },
): { accepted: File[]; rejected: RejectedFile[] } {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  const acceptedTypes = options.acceptedTypes ?? ACCEPTED_IMAGE_TYPES;

  const existingFingerprints = new Set(
    items
      .filter((item) => item.file && item.status !== "failed")
      .map((item) => fileFingerprint(item.file as File)),
  );

  let remaining = Math.max(0, options.maxImages - occupiedSlots(items));
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    if (!acceptedTypes.includes(file.type)) {
      rejected.push({ name: file.name, reason: "type" });
      continue;
    }
    if (file.size > maxBytes) {
      rejected.push({ name: file.name, reason: "size" });
      continue;
    }
    const fingerprint = fileFingerprint(file);
    if (existingFingerprints.has(fingerprint)) {
      rejected.push({ name: file.name, reason: "duplicate" });
      continue;
    }
    // Kontenjan kontrolü EN SONA bırakılır: geçersiz bir dosya kontenjan
    // harcamamalı, "limit" gerekçesi yalnız gerçekten sığmayanlara yazılmalı.
    if (remaining <= 0) {
      rejected.push({ name: file.name, reason: "limit" });
      continue;
    }
    existingFingerprints.add(fingerprint);
    remaining -= 1;
    accepted.push(file);
  }

  return { accepted, rejected };
}

/** Kalemi listeden çıkar. */
export function removeItem(
  items: ListingImageItem[],
  clientId: string,
): ListingImageItem[] {
  return items.filter((item) => item.clientId !== clientId);
}

/** Kalemi `from` konumundan `to` konumuna taşı (sürükle-bırak / klavye). */
export function moveItem(
  items: ListingImageItem[],
  from: number,
  to: number,
): ListingImageItem[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Kapak görseli = listenin İLK kalemi. Ayrı bir veritabanı alanı yok; sıra
 * zaten `sortOrder` ile saklanıyor, ikinci bir kaynak tutmak ikisinin
 * ayrışması demekti.
 */
export function makeCover(
  items: ListingImageItem[],
  index: number,
): ListingImageItem[] {
  return moveItem(items, index, 0);
}

/** Kalemi kimliğinden güncelle (kuyruk ilerlemesi, hata, sonuç). */
export function patchItem(
  items: ListingImageItem[],
  clientId: string,
  patch: Partial<ListingImageItem>,
): ListingImageItem[] {
  return items.map((item) =>
    item.clientId === clientId ? { ...item, ...patch } : item,
  );
}
