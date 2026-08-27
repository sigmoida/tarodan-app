import {
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { i18nMessage } from "../i18n";

// Sharp is optional - image resizing will be skipped if not available.
// Yükleme hatası SESSİZCE yutulmasın: staging'de imaj sharp'sız çıktığında tek
// gördüğümüz 400 cevabıydı, neden bilgisi yoktu — nedeni sakla ve logla.
let sharp: any;
let sharpLoadError: string | null = null;
try {
  sharp = configureSharpSafety(require("sharp"));
} catch (e: any) {
  sharp = null;
  sharpLoadError = e?.message ?? String(e);
  // Logger burada (module scope) yok; boot log'unda görünsün.
  // eslint-disable-next-line no-console
  console.error(`[MediaService] sharp failed to load: ${sharpLoadError}`);
}

export interface UploadOptions {
  bucket?: StorageBucketType;
  folder?: string;
  maxSize?: number;
  allowedTypes?: string[];
  resize?: {
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  };
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
  ) {}

  /**
   * Faz 0: private mesaj ekinin KALICI istemci URL'si — public S3 URL yerine
   * yetkili servis ucu. Message.content'e bu gömülür; okuma anında presigned'a
   * yönlendirilir (getMessageAttachmentPresignedUrl).
   */
  buildMessageAttachmentUrl(mediaFileId: string): string {
    const apiUrl = (
      this.configService.get<string>("API_URL") || "http://localhost:3001"
    ).replace(/\/$/, "");
    return `${apiUrl}/api/media/message-attachment/${mediaFileId}`;
  }

  /**
   * Mesaj ekini presigned URL'e çözer. Yalnız `messages` kökündeki dosyalar —
   * bu uç üzerinden başka bucket'lara (fatura vb.) erişilemez. Çağıran
   * controller JWT zorunlu kılar; uuid tahmin edilemezliği + kısa süreli
   * presigned ile birlikte erişim modeli budur (thread-üyeliği denetimi v2).
   */
  async getMessageAttachmentPresignedUrl(mediaFileId: string): Promise<string> {
    const file = await this.prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      select: { key: true, bucket: true },
    });
    if (!file || file.bucket !== "messages") {
      throw new NotFoundException(i18nMessage("server.media.fileNotFound"));
    }
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

    // Generate unique filename
    const ext = file.originalname.split(".").pop();
    const filename = `${uuidv4()}.${ext}`;

    try {
      let buffer = file.buffer;

      // Process image if resize options provided and sharp is available
      if (resize && file.mimetype.startsWith("image/") && sharp) {
        buffer = await sharp(buffer)
          .autoOrient()
          .resize(resize.width, resize.height, { fit: resize.fit || "cover" })
          .toBuffer();
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
    if (!sharp) {
      this.logger.error(
        `sharp unavailable (load error: ${sharpLoadError ?? "unknown"}) — image upload rejected`,
      );
      throw new BadRequestException(
        "Image processing (sharp) is not available",
      );
    }
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

    return this.writeProductImageVariants(file.buffer, ownerUserId);
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
    if (!sharp) {
      this.logger.error(
        `sharp unavailable (load error: ${sharpLoadError ?? "unknown"}) — image rotate rejected`,
      );
      throw new BadRequestException(
        "Image processing (sharp) is not available",
      );
    }
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
    const rotated = await sharp(source).rotate(90).toBuffer();

    return this.writeProductImageVariants(rotated, ownerUserId);
  }

  /**
   * Bir görsel tamponundan kart + detay türevlerini üretip depoya yazar.
   *
   * Yükleme ve DÖNDÜRME aynı gövdeyi paylaşır: iki ölçü, iki kalite ve
   * yönlendirme kuralı tek yerde durmalı, yoksa döndürülen bir görsel
   * yüklenenle aynı biçimde üretilmiyor olurdu.
   */
  private async writeProductImageVariants(
    source: Buffer,
    ownerUserId: string,
  ): Promise<{ cardKey: string; detailKey: string }> {
    const baseId = uuidv4();
    const folder = productImageFolder(ownerUserId);
    const cacheOpts = {
      contentType: "image/webp" as const,
      cacheControl: "public, max-age=31536000, immutable",
      skipMediaFile: true,
    };

    const cardBuffer = await sharp(source)
      .autoOrient()
      .resize(500, 500, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();

    const detailBuffer = await sharp(source)
      .autoOrient()
      .resize(1200, 1200, { fit: "inside" })
      .webp({ quality: 90 })
      .toBuffer();

    const cardResult = await this.storageService.uploadFile(cardBuffer, {
      bucket: "products",
      folder,
      filename: `${baseId}-card.webp`,
      mimeType: "image/webp",
      ...cacheOpts,
    });

    const detailResult = await this.storageService.uploadFile(detailBuffer, {
      bucket: "products",
      folder,
      filename: `${baseId}-detail.webp`,
      mimeType: "image/webp",
      ...cacheOpts,
    });

    return { cardKey: cardResult.key, detailKey: detailResult.key };
  }

  /**
   * Upload collection cover image (1200x600 WebP). Returns S3 key. Skips MediaFile.
   */
  async uploadCollectionCover(
    file: Express.Multer.File,
  ): Promise<{ key: string }> {
    if (!sharp) {
      this.logger.error(
        `sharp unavailable (load error: ${sharpLoadError ?? "unknown"}) — image upload rejected`,
      );
      throw new BadRequestException(
        "Image processing (sharp) is not available",
      );
    }
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

    const buffer = await sharp(file.buffer)
      .autoOrient()
      .resize(1200, 600, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();

    const result = await this.storageService.uploadFile(buffer, {
      bucket: "collections",
      folder: "covers",
      filename: `${uuidv4()}.webp`,
      mimeType: "image/webp",
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      skipMediaFile: true,
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
