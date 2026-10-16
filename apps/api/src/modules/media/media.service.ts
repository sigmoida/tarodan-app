import {
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ResizeOptions, Sharp, WebpOptions } from "sharp";
import { v4 as uuidv4 } from "uuid";
import { MembershipService } from "../membership/membership.service";
import { PrismaService } from "../../prisma";
import {
  productImageFolder,
  isOwnedProductImageKey,
} from "../product/helpers/product-image-keys";
import {
  StorageService,
  UploadOptions as StorageUploadOptions,
  StorageBucketType,
  isPublicBucket,
} from "../storage/storage.service";
import {
  configureSharpSafety,
  isBlockedSharpMimeType,
} from "../../common/image/sharp-safety";
import { stripImageMetadata } from "../../common/image/strip-image-metadata";
import { i18nMessage } from "../i18n";
import {
  isMessageAttachmentId,
  messageAttachmentIdFromUrl,
  messageAttachmentUrl,
} from "./helpers/message-attachment-url";
import { MessageAttachmentAccessService } from "../messaging/attachment-access/message-attachment-access.service";
import type { RequestUser } from "../auth/interfaces/jwt-payload.interface";

/**
 * sharp modülünün KENDİ tipi. `require` `any` döndürür; açıkça bağlanmazsa
 * boyutlandırma/kodlama seçeneklerini derleyici hiç denetlemez.
 */
type SharpFactory = typeof import("sharp");

// Sharp is optional - image resizing will be skipped if not available.
// Yükleme hatası SESSİZCE yutulmasın: staging'de imaj sharp'sız çıktığında tek
// gördüğümüz 400 cevabıydı, neden bilgisi yoktu — nedeni sakla ve logla.
let sharp: SharpFactory | null;
let sharpLoadError: string | null = null;
try {
  sharp = configureSharpSafety(require("sharp") as SharpFactory);
} catch (e: any) {
  sharp = null;
  sharpLoadError = e?.message ?? String(e);
  // Logger burada (module scope) yok; boot log'unda görünsün.
  // eslint-disable-next-line no-console
  console.error(`[MediaService] sharp failed to load: ${sharpLoadError}`);
}

/** Tek görsel türevi: boyutlandırma + WebP kodlaması (sharp'ın kendi tipleri). */
interface ImageVariant {
  resize: ResizeOptions;
  webp: WebpOptions;
}

/** Ürün detay türevi: en çok 1200 px, oran korunur. */
const PRODUCT_DETAIL_VARIANT = {
  resize: { width: 1200, height: 1200, fit: "inside" },
  webp: { quality: 90 },
} satisfies ImageVariant;

/** Ürün kart türevi: 500×500 kırpılmış. */
const PRODUCT_CARD_VARIANT = {
  resize: { width: 500, height: 500, fit: "cover" },
  webp: { quality: 85 },
} satisfies ImageVariant;

/** Koleksiyon kapağı: 1200×600 kırpılmış. */
const COLLECTION_COVER_VARIANT = {
  resize: { width: 1200, height: 600, fit: "cover" },
  webp: { quality: 85 },
} satisfies ImageVariant;

/**
 * Uuid adlı, üzerine asla yazılmayan WebP türevlerinin depo seçenekleri — ürün
 * kartı/detayı ve koleksiyon kapağı aynısını kullanır. Tipi depo servisinin
 * kendi `UploadOptions`'ından gelir.
 */
const IMMUTABLE_WEBP_UPLOAD = {
  mimeType: "image/webp",
  contentType: "image/webp",
  cacheControl: "public, max-age=31536000, immutable",
  skipMediaFile: true,
} satisfies Partial<StorageUploadOptions>;

/** Türevi uygular: boyutlandır + WebP. Yönlendirme (autoOrient) çağıranın işidir. */
function encodeVariant(
  pipeline: Sharp,
  variant: ImageVariant,
): Promise<Buffer> {
  return pipeline.resize(variant.resize).webp(variant.webp).toBuffer();
}

export interface UploadOptions {
  bucket?: StorageBucketType;
  folder?: string;
  maxSize?: number;
  allowedTypes?: string[];
  /**
   * sharp'ın kendi `ResizeOptions` alanları. `withoutEnlargement`: "en çok şu
   * kadar" sınırı — küçük görsel büyütülmez (bulanıklaşmasın).
   */
  resize?: Pick<
    ResizeOptions,
    "width" | "height" | "fit" | "withoutEnlargement"
  >;
  generateThumbnail?: boolean;
  entityType?: string;
  entityId?: string;
}

export interface UploadResult {
  url?: string; // Public kökte kalıcı URL; private kökte presigned/servis ucu
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
  /** Yazılan MediaFile kaydı — private servis uçları (message-attachment) için. */
  mediaFileId?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly defaultBucket: StorageBucketType = "products";

  constructor(
    private configService: ConfigService,
    private membershipService: MembershipService,
    private storageService: StorageService,
    private prisma: PrismaService,
    private attachmentAccess: MessageAttachmentAccessService,
  ) {}

  /**
   * Yüklenmiş sharp'ı döner; yüklenemediyse nedenini loglayıp 400 verir.
   * Görsel türevi üreten her uç bu kapıdan geçer.
   */
  private requireSharp(action: "upload" | "rotate"): SharpFactory {
    if (!sharp) {
      this.logger.error(
        `sharp unavailable (load error: ${sharpLoadError ?? "unknown"}) — image ${action} rejected`,
      );
      throw new BadRequestException(
        "Image processing (sharp) is not available",
      );
    }
    return sharp;
  }

  /**
   * Faz 0: private mesaj ekinin KALICI istemci URL'si — public S3 URL yerine
   * yetkili servis ucu. Message.content'e bu gömülür; okuma anında presigned'a
   * yönlendirilir (getMessageAttachmentPresignedUrl).
   */
  buildMessageAttachmentUrl(mediaFileId: string): string {
    return messageAttachmentUrl(
      this.configService.get<string>("API_URL") || "http://localhost:3001",
      mediaFileId,
    );
  }

  /**
   * Mesaj gövdesindeki `[IMG:…]` hedeflerinden GEÇERSİZ olanları döner (boş
   * dizi = hepsi geçerli). Geçerli hedef: bu sunucunun `buildMessageAttachmentUrl`
   * ile BİREBİR ürettiği URL + `messages` kökünde, GÖNDERİCİNİN yüklediği bir
   * MediaFile. Başka her şey (harici URL, çıplak key, başka kullanıcının eki,
   * başka bucket) reddedilir — alıcının istemcisi bu görseli kendi oturum
   * jetonuyla yükler.
   *
   * Konu (thread) bağı denetlenemez: ek, mesajdan ÖNCE yüklenir ve MediaFile
   * konu bilgisi taşımaz; sahiplik göndericiyle sınırlanır.
   */
  async findInvalidMessageAttachmentTargets(
    targets: string[],
    uploaderId: string,
  ): Promise<string[]> {
    const idByTarget = new Map<string, string | null>();
    for (const target of targets) {
      const id = messageAttachmentIdFromUrl(target);
      idByTarget.set(
        target,
        id && this.buildMessageAttachmentUrl(id) === target ? id : null,
      );
    }

    const ids = [
      ...new Set(
        [...idByTarget.values()].filter((id): id is string => id !== null),
      ),
    ];
    const owned = ids.length
      ? await this.prisma.mediaFile.findMany({
          where: { id: { in: ids }, bucket: "messages", uploaderId },
          select: { id: true },
        })
      : [];
    const ownedIds = new Set(owned.map((file) => file.id));

    return targets.filter((target) => {
      const id = idByTarget.get(target);
      return !id || !ownedIds.has(id);
    });
  }

  /**
   * Mesaj ekini presigned URL'e çözer. Yalnız `messages` kökündeki dosyalar —
   * bu uç üzerinden başka bucket'lara (fatura vb.) erişilemez.
   *
   * Erişim: yükleyen, eki taşıyan mesajın alıcısı veya admin
   * (`MessageAttachmentAccessService`). Yetkisiz istek de 404 alır (403
   * değil) — id yoklayarak bir ekin VARLIĞI öğrenilemesin.
   */
  async getMessageAttachmentPresignedUrl(
    mediaFileId: string,
    requester: Pick<RequestUser, "id" | "isAdmin">,
  ): Promise<string> {
    const notFound = () =>
      new NotFoundException(i18nMessage("server.media.fileNotFound"));
    if (!isMessageAttachmentId(mediaFileId)) throw notFound();

    const file = await this.prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      select: { id: true, key: true, bucket: true, uploaderId: true },
    });
    if (!file || file.bucket !== "messages") throw notFound();

    const allowed =
      requester.isAdmin === true ||
      (await this.attachmentAccess.canRead(file, requester.id));
    if (!allowed) throw notFound();

    return this.storageService.getPresignedDownloadUrl(
      "messages",
      file.key,
      600, // 10 dk — her görüntülemede yeniden çözülür
    );
  }

  async upload(
    file: Express.Multer.File,
    options: UploadOptions = {},
    uploaderId?: string,
  ): Promise<UploadResult> {
    const {
      bucket = this.defaultBucket,
      folder = "uploads",
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"],
      resize,
      generateThumbnail = false,
      entityType,
      entityId,
    } = options;

    // Validate file size
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${maxSize / 1024 / 1024}MB)`,
      );
    }

    // Validate file type
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type '${file.mimetype}' is not allowed`,
      );
    }

    // Public kökün kalıcı URL'i `S3_PUBLIC_BASE_URL`'den kurulur. Tanımsızsa
    // nesne yüklenip `url: ""` dönüyor, istemci boş URL'i kaydediyordu
    // (reklam görseli kırık kalıyordu). Yüklemeden ÖNCE açık 503 ver; aşağıdaki
    // try bloğu her hatayı 400'e çevirdiği için kontrol onun dışında.
    if (
      isPublicBucket(bucket) &&
      !this.storageService.hasPublicAssetBaseUrl()
    ) {
      throw new ServiceUnavailableException(
        i18nMessage("server.storage.publicUrlNotConfigured"),
      );
    }

    // Generate unique filename
    const ext = file.originalname.split(".").pop();
    const filename = `${uuidv4()}.${ext}`;

    // Görsel her yolda sharp'tan geçer (meta veri silme dahil); sharp yoksa
    // ham dosyayı (GPS'iyle) yüklemek yerine açık hata — ürün görseli yolu
    // da aynı kapıyı kullanır. Try'ın dışında: nedeni 400'e gömülmesin.
    const sharpLib = file.mimetype.startsWith("image/")
      ? this.requireSharp("upload")
      : null;

    try {
      let buffer = file.buffer;

      if (sharpLib) {
        // Boyutlandırmalı yolda da sharp çıktısı meta veriyi taşımaz;
        // boyutlandırmasız yolda (mesaj eki, iade kanıtı, yorum/koleksiyon
        // görseli) EXIF/GPS ayrıca silinir. İkisinde de yön önce uygulanır.
        buffer = resize
          ? await sharpLib(buffer)
              .autoOrient()
              .resize(resize.width, resize.height, {
                fit: resize.fit || "cover",
                withoutEnlargement: resize.withoutEnlargement,
              })
              .toBuffer()
          : await stripImageMetadata(sharpLib, buffer);
      }

      // Upload main file using StorageService
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        {
          bucket,
          folder,
          filename,
          mimeType: file.mimetype,
          entityType,
          entityId,
        },
        uploaderId,
      );

      const result: UploadResult = {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        size: uploadResult.size,
        mimeType: uploadResult.mimeType,
        mediaFileId: uploadResult.mediaFileId,
      };

      // URL politikası (Faz 0): public kökteki nesne KALICI public URL alır.
      // Eskiden 1 saatlik presigned dönüyordu ve içerik alanlarına (mesaj/rating)
      // gömülen URL bir saat sonra ÖLÜYORDU. Private köklerde presigned kalır;
      // messages'ın kalıcı yetkili ucu controller'da kurulur.
      if (isPublicBucket(bucket)) {
        result.url = this.storageService.getPublicAssetUrl(uploadResult.key);
      } else {
        try {
          result.url = await this.storageService.getPresignedDownloadUrl(
            bucket,
            uploadResult.key,
            3600, // 1 hour
          );
        } catch (err: any) {
          this.logger.warn(
            `Presigned URL generation failed for ${uploadResult.key}: ${err.message}`,
          );
          // Fallback: keep url undefined — frontend should handle this gracefully
        }
      }

      // Generate thumbnail if requested and sharp is available
      if (generateThumbnail && file.mimetype.startsWith("image/") && sharp) {
        const thumbBuffer = await sharp(file.buffer)
          .autoOrient()
          .resize(200, 200, { fit: "cover" })
          .toBuffer();

        const thumbFilename = `thumb_${filename}`;
        const thumbResult = await this.storageService.uploadFile(
          thumbBuffer,
          {
            bucket,
            folder: `${folder}/thumbnails`,
            filename: thumbFilename,
            mimeType: file.mimetype,
            entityType,
            entityId,
          },
          uploaderId,
        );

        result.thumbnail = thumbResult.key;
      }

      this.logger.log(`File uploaded: ${uploadResult.key}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException("File upload failed");
    }
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    options: UploadOptions = {},
    uploaderId?: string,
  ): Promise<UploadResult[]> {
    return Promise.all(
      files.map((file) => this.upload(file, options, uploaderId)),
    );
  }

  async delete(
    key: string,
    bucket: string = this.defaultBucket,
  ): Promise<void> {
    try {
      await this.storageService.deleteFile(bucket, key);
      this.logger.log(`File deleted: ${key}`);
    } catch (error: any) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw new BadRequestException("File deletion failed");
    }
  }

  async deleteMultiple(
    keys: string[],
    bucket: string = this.defaultBucket,
  ): Promise<void> {
    try {
      const files = keys.map((key) => ({ bucket, key }));
      await this.storageService.deleteFiles(files);
      this.logger.log(`Files deleted: ${keys.length} items`);
    } catch (error: any) {
      this.logger.error(`Bulk delete failed: ${error.message}`);
      throw new BadRequestException("Bulk file deletion failed");
    }
  }

  async getPresignedUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600,
  ): Promise<string> {
    return this.storageService.getPresignedDownloadUrl(bucket, key, expiry);
  }

  async getPresignedUploadUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600,
  ): Promise<string> {
    return this.storageService.getPresignedUploadUrl(bucket, key, expiry);
  }

  async uploadBuffer(
    buffer: Buffer,
    options: {
      folder?: string;
      filename?: string;
      mimeType?: string;
      bucket?: "products" | "avatars" | "documents" | "collections" | "tickets";
      entityType?: string;
      entityId?: string;
    } = {},
    uploaderId?: string,
  ): Promise<UploadResult> {
    const bucket = options.bucket || this.defaultBucket;
    const folder = options.folder || "uploads";
    const filename = options.filename || `${uuidv4()}.jpg`;
    const mimeType = options.mimeType || "image/jpeg";

    try {
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        {
          bucket,
          folder,
          filename,
          mimeType,
          entityType: options.entityType,
          entityId: options.entityId,
        },
        uploaderId,
      );

      return {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        size: uploadResult.size,
        mimeType: uploadResult.mimeType,
      };
    } catch (error: any) {
      this.logger.error(`Buffer upload failed: ${error.message}`);
      throw new BadRequestException("Buffer upload failed");
    }
  }

  /**
   * Faz 0: S3→S3 sunucu-taraflı kopya (StorageService.copyFile,
   * MetadataDirective=COPY). Eski sürüm indir+yeniden-yükle yapıyor ve
   * content-type'ı application/octet-stream'e DÜŞÜRÜYORDU — tarayıcı görseli
   * indirilebilir dosya sanıyordu.
   */
  async copyFile(
    sourceKey: string,
    destKey: string,
    _sourceBucket: string = this.defaultBucket,
    destBucket: StorageBucketType = this.defaultBucket,
  ): Promise<void> {
    try {
      await this.storageService.copyFile(sourceKey, {
        bucket: destBucket,
        folder: destKey.substring(0, destKey.lastIndexOf("/")),
        filename: destKey.substring(destKey.lastIndexOf("/") + 1),
      });
      this.logger.log(`File copied from ${sourceKey} to ${destKey}`);
    } catch (error: any) {
      this.logger.error(`Copy failed: ${error.message}`);
      throw new BadRequestException("File copy failed");
    }
  }

  /**
   * Upload product image as two variants (card 500x500, detail 1200x1200) in WebP.
   * Returns S3 keys for direct public URL construction. Skips MediaFile.
   */
  async uploadProductImageVariants(
    file: Express.Multer.File,
    /**
     * Yükleyen kullanıcı. Anahtar bu kullanıcının klasörüne iner; ilan
     * oluşturma/düzenleme anahtarın sahibini böyle doğrular (ayrı bir tablo
     * ya da migration gerekmeden).
     */
    ownerUserId: string,
  ): Promise<{ cardKey: string; detailKey: string }> {
    const sharpLib = this.requireSharp("upload");
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (
      !allowedTypes.includes(file.mimetype) ||
      isBlockedSharpMimeType(file.mimetype)
    ) {
      throw new BadRequestException(
        i18nMessage("server.media.unsupportedTypeWithGif"),
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(i18nMessage("server.media.fileTooLarge"));
    }

    return this.writeProductImageVariants(sharpLib, file.buffer, ownerUserId);
  }

  /**
   * Kayıtlı bir ürün görselini 90° çevirip YENİ türevler üretir.
   *
   * Yüklemeden sonra düzeltmenin tek yolu buydu: EXIF etiketi taşımayan
   * fotoğraflarda (ekran görüntüsü, meta verisi silinmiş dosyalar) sunucunun
   * otomatik yönlendirmesi çalışacak bir bilgi bulamıyor, satıcının da elinde
   * artık yerel dosya yok — yalnız depodaki türevler var.
   *
   * Kaynak DETAY türevidir (1200px): kart 500×500 kırpılmış olduğu için onu
   * çevirip yeniden kırpmak kadrajı ikinci kez daraltırdı. Orijinal dosya
   * saklanmadığından bu bir tur daha kayıplı kodlama demektir; kaçınılmaz.
   *
   * Eski anahtarlar SİLİNMEZ: ürün yeni anahtarlara bağlanınca eskiler
   * sahipsiz kalır ve günlük `media-temp-cleanup` işi onları toplar. Burada
   * silmek, kayıt başarısız olursa satıcıyı görselsiz bırakırdı.
   */
  async rotateProductImageVariants(
    detailKey: string,
    ownerUserId: string,
  ): Promise<{ cardKey: string; detailKey: string }> {
    const sharpLib = this.requireSharp("rotate");
    // Sahiplik İKİ yoldan kabul edilir, çünkü depoda iki anahtar şeması var:
    //
    //  - yeni şema anahtarı kullanıcının yükleme klasöründedir
    //    (`product-images/temp/u/{userId}/`) — henüz kaydedilmemiş, taze
    //    yüklenmiş görseller böyle doğrulanır;
    //  - ESKİ şemadaki anahtarlar o klasörde DEĞİLDİR. Onlar için ölçüt,
    //    anahtarın kullanıcının kendi ürününe hâlen bağlı olmasıdır.
    //
    // Yalnız klasöre bakmak, eski şemadaki görsellerin (kayıtların çoğu)
    // sahibi tarafından bile çevrilememesi demekti. Kaydetme yolu da aynı
    // kaçışı kullanıyor (`assertValidProductImages` → `existingKeys`).
    const ownsKey =
      isOwnedProductImageKey(detailKey, ownerUserId) ||
      (await this.prisma.productImage.count({
        where: { detailKey, product: { sellerId: ownerUserId } },
      })) > 0;
    if (!ownsKey) {
      throw new ForbiddenException(i18nMessage("server.media.fileForbidden"));
    }

    const source = await this.storageService.downloadFileByKey(detailKey);
    // Saat yönünde 90°. Kaynak zaten yönlendirilmiş bir WebP, o yüzden
    // `autoOrient` burada etkisiz — çevirme AÇIKÇA istenir.
    const rotated = await sharpLib(source).rotate(90).toBuffer();

    return this.writeProductImageVariants(sharpLib, rotated, ownerUserId);
  }

  /**
   * Bir görsel tamponundan kart + detay türevlerini üretip depoya yazar.
   *
   * Yükleme ve DÖNDÜRME aynı gövdeyi paylaşır: iki ölçü, iki kalite ve
   * yönlendirme kuralı tek yerde durmalı, yoksa döndürülen bir görsel
   * yüklenenle aynı biçimde üretilmiyor olurdu.
   */
  private async writeProductImageVariants(
    sharpLib: SharpFactory,
    source: Buffer,
    ownerUserId: string,
  ): Promise<{ cardKey: string; detailKey: string }> {
    const baseId = uuidv4();
    const folder = productImageFolder(ownerUserId);

    // Kaynak TEK kez çözülür: detay (1200 inside) kaynaktan, kart (500×500
    // cover) bu detay tamponundan üretilir. İki kez tam çözmek tepe belleği
    // ikiye katlıyordu; detay zaten yönlendirilmiş ve 1200 px'e inmiş olduğu
    // için kart için `autoOrient` gerekmez. Encode'lar sıralıdır; yalnız iki
    // depo yüklemesi paralel koşar (süreyi asıl bekleyen kısım onlar).
    const detailBuffer = await encodeVariant(
      sharpLib(source).autoOrient(),
      PRODUCT_DETAIL_VARIANT,
    );

    const cardBuffer = await encodeVariant(
      sharpLib(detailBuffer),
      PRODUCT_CARD_VARIANT,
    );

    // Hata semantiği: bir yükleme düşerse çağrı reddedilir; ama `Promise.all`
    // diğer yüklemeyi İPTAL ETMEZ — o tamamlanırsa nesne depoda SAHİPSİZ kalır
    // (eskiden yalnız kart yazılıp detay düşünce kart böyle kalıyordu; artık
    // her iki yönde de olabilir). Anahtarlar kullanıcının geçici klasöründedir
    // (`productImageFolder`); ürüne bağlanmayanları günlük `media-temp-cleanup`
    // işi toplar, burada ayrıca silmek silmenin kendi hatasını yönetmek demek.
    const [cardResult, detailResult] = await Promise.all([
      this.storageService.uploadFile(cardBuffer, {
        bucket: "products",
        folder,
        filename: `${baseId}-card.webp`,
        ...IMMUTABLE_WEBP_UPLOAD,
      }),
      this.storageService.uploadFile(detailBuffer, {
        bucket: "products",
        folder,
        filename: `${baseId}-detail.webp`,
        ...IMMUTABLE_WEBP_UPLOAD,
      }),
    ]);

    return { cardKey: cardResult.key, detailKey: detailResult.key };
  }

  /**
   * Upload collection cover image (1200x600 WebP). Returns S3 key. Skips MediaFile.
   */
  async uploadCollectionCover(
    file: Express.Multer.File,
  ): Promise<{ key: string }> {
    const sharpLib = this.requireSharp("upload");
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (
      !allowedTypes.includes(file.mimetype) ||
      isBlockedSharpMimeType(file.mimetype)
    ) {
      throw new BadRequestException(
        i18nMessage("server.media.unsupportedType"),
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(i18nMessage("server.media.fileTooLarge"));
    }

    const buffer = await encodeVariant(
      sharpLib(file.buffer).autoOrient(),
      COLLECTION_COVER_VARIANT,
    );

    const result = await this.storageService.uploadFile(buffer, {
      bucket: "collections",
      folder: "covers",
      filename: `${uuidv4()}.webp`,
      ...IMMUTABLE_WEBP_UPLOAD,
    });

    return { key: result.key };
  }

  async getFileInfo(
    key: string,
    bucket: string = this.defaultBucket,
  ): Promise<{ size: number; lastModified: Date; contentType: string }> {
    // S3'te file info için presigned URL ile HEAD request yapabiliriz
    // Veya database'den bilgi alabiliriz
    // Şimdilik basit bir implementasyon
    try {
      const presignedUrl = await this.storageService.getPresignedDownloadUrl(
        bucket,
        key,
        60,
      );
      const response = await fetch(presignedUrl, { method: "HEAD" });

      return {
        size: parseInt(response.headers.get("content-length") || "0", 10),
        lastModified: new Date(
          response.headers.get("last-modified") || Date.now(),
        ),
        contentType:
          response.headers.get("content-type") || "application/octet-stream",
      };
    } catch (error: any) {
      this.logger.error(`Get file info failed: ${error.message}`);
      throw new BadRequestException("Get file info failed");
    }
  }
}
