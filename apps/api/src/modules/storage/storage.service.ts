import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as crypto from "crypto";
import { fromBuffer as fileTypeFromBuffer } from "file-type";

export interface UploadResult {
  key: string;
  // URL artık presigned URL değil, sadece identifier
  // Gerçek erişim için getPresignedDownloadUrl() kullanılmalı
  url?: string; // Deprecated - sadece backward compatibility için
  bucket: string;
  size: number;
  mimeType: string;
}

export interface UploadOptions {
  bucket: "products" | "avatars" | "documents" | "collections" | "tickets";
  folder?: string;
  filename?: string;
  mimeType?: string;
  isPublic?: boolean; // Artık kullanılmıyor, her şey private
  entityType?: string;
  entityId?: string;
  cacheControl?: string;
  contentType?: string;
  skipMediaFile?: boolean;
}

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
// Private document buckets (invoices, ticket attachments): PDFs and images are
// legitimate; executables, scripts, HTML and SVG are not. Validated by real
// magic bytes so a spoofed Content-Type cannot smuggle active content in (#71).
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const DOCUMENT_BUCKETS = ["documents", "tickets"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Bucket görünürlük politikası — TEK KAYNAK. S3 bucket-policy ile birebir uyumlu olmalı.
 *
 * PUBLIC: S3'te public-read (doğrudan, cache'lenebilir URL ile servis edilir).
 *   → S3 policy "PublicReadProductAndCollectionImages":
 *     {dev,staging,prod}/{products,collections,avatars}/*.
 *   products/collections: katalog görselleri. avatars: herkese görünür profil foto.
 * PRIVATE (bu listede OLMAYAN: documents, tickets): hassas içerik (fatura vb.) —
 *   yalnızca kendi yetkili modülünün endpoint'inden, presigned ile servis edilir.
 */
export const PUBLIC_BUCKETS = ["products", "collections", "avatars"] as const;

export function isPublicBucket(bucket: string): boolean {
  return (PUBLIC_BUCKETS as readonly string[]).includes(bucket);
}

/** Public object key: <environment>/<public bucket>/<object path>. */
export function isPublicStorageKey(key: string): boolean {
  const normalized = key.startsWith("/") ? key.slice(1) : key;
  return /^[a-z0-9][a-z0-9_-]*\/(?:products|collections|avatars)\//i.test(
    normalized,
  );
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private readonly baseBucket: string;
  private readonly envPrefix: string;
  private isS3Available = false;
  private hasCredentials = false;

  // Bucket tipleri -> klasör isimleri mapping
  private readonly bucketFolders = {
    products: "products",
    avatars: "avatars",
    documents: "documents",
    collections: "collections",
    tickets: "tickets",
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseBucket = this.configService.get("S3_BUCKET", "amzn-tarodan");

    // Environment prefix belirle
    const nodeEnv = this.configService.get("NODE_ENV", "development");
    this.envPrefix =
      this.configService.get("S3_ENV_PREFIX") ||
      (nodeEnv === "production" ? "prod" : "dev");

    // Credentials kontrolü - yoksa S3Client oluşturma
    const accessKeyId = this.configService.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>(
      "AWS_SECRET_ACCESS_KEY",
    );

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        "⚠️ AWS S3 credentials not configured. Storage will be unavailable.",
      );
      this.hasCredentials = false;
      return;
    }

    this.hasCredentials = true;

    // S3 Client oluştur (MinIO veya AWS S3)
    const s3Config: any = {
      region: this.configService.get("AWS_REGION", "eu-west-1"),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    const s3Endpoint = this.configService.get<string>("S3_ENDPOINT");
    if (s3Endpoint) {
      s3Config.endpoint = s3Endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);

    this.logger.log(
      `S3 Storage initialized: ${this.baseBucket} (${this.envPrefix})`,
    );
  }

  async onModuleInit() {
    if (!this.hasCredentials || !this.s3Client) {
      this.logger.warn(
        "⚠️ Skipping S3 bucket check - no credentials configured.",
      );
      this.isS3Available = false;
      return;
    }

    try {
      // Bucket'ın varlığını kontrol et
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.baseBucket }),
      );
      this.isS3Available = true;
      this.logger.log(`✅ AWS S3 connection established: ${this.baseBucket}`);
    } catch (error: any) {
      this.logger.error(`❌ AWS S3 connection failed: ${error.message}`);
      this.isS3Available = false;
    }
  }

  /**
   * Check if S3 storage is available
   */
  isStorageAvailable(): boolean {
    return this.isS3Available;
  }

  /**
   * Ana upload fonksiyonu - "create content" tarzı
   * Seed script'lerinde de kullanılabilir
   * Tüm dosya yüklemeleri bu fonksiyon üzerinden yapılır
   */
  async uploadFile(
    buffer: Buffer,
    options: UploadOptions,
    uploaderId?: string,
  ): Promise<UploadResult> {
    if (!this.isS3Available) {
      throw new BadRequestException(
        "Dosya yükleme servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
      );
    }

    // Bucket tipini validate et
    if (!this.bucketFolders[options.bucket]) {
      throw new BadRequestException(`Geçersiz bucket tipi: ${options.bucket}`);
    }

    // Dosya boyutu kontrolü
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException("Dosya boyutu çok büyük (max 10MB)");
    }

    // Resim dosyaları için mime type kontrolü
    if (["products", "avatars", "collections"].includes(options.bucket)) {
      if (
        !options.mimeType ||
        !ALLOWED_IMAGE_TYPES.includes(options.mimeType)
      ) {
        throw new BadRequestException(
          "Geçersiz dosya tipi. Sadece JPEG, PNG, WebP, GIF desteklenir.",
        );
      }
      // The client Content-Type is spoofable — verify the real bytes (#71).
      const sniffed = await fileTypeFromBuffer(buffer);
      if (!sniffed || !ALLOWED_IMAGE_TYPES.includes(sniffed.mime)) {
        throw new BadRequestException("Dosya içeriği geçerli bir resim değil.");
      }
    } else if (DOCUMENT_BUCKETS.includes(options.bucket)) {
      // documents/tickets previously skipped content validation entirely (#71).
      // The uploaded Content-Type is spoofable, so verify the real bytes: only
      // PDFs and images may land in these private buckets — never HTML, SVG,
      // scripts or executables. Server-generated invoice PDFs (real %PDF) pass.
      const sniffed = await fileTypeFromBuffer(buffer);
      if (!sniffed || !ALLOWED_DOCUMENT_TYPES.includes(sniffed.mime)) {
        throw new BadRequestException(
          "Dosya içeriği geçerli bir belge (PDF veya resim) değil.",
        );
      }
    }

    // Unique key oluştur
    const ext = this.getExtension(
      options.mimeType || "application/octet-stream",
    );
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const filename = options.filename || `${uniqueId}${ext}`;

    // Klasör yapısı: {env}/{bucketType}/{folder}/{filename}
    // Örnek: dev/products/product-images/abc123.jpg
    const bucketFolder = this.bucketFolders[options.bucket];
    const customFolder = options.folder ? `${options.folder}/` : "";
    const key = `${this.envPrefix}/${bucketFolder}/${customFolder}${filename}`;

    try {
      const contentType =
        options.contentType ?? options.mimeType ?? "application/octet-stream";
      const commandParams: PutObjectCommandInput = {
        Bucket: this.baseBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          "uploader-id": uploaderId || "",
          "entity-type": options.entityType || "",
          "entity-id": options.entityId || "",
        },
      };
      if (options.cacheControl) {
        commandParams.CacheControl = options.cacheControl;
      }
      const command = new PutObjectCommand(commandParams);

      await this.s3Client.send(command);

      // Database'e kaydet (skipMediaFile=true ise atla - public product/collection assets)
      if (!options.skipMediaFile) {
        await this.prisma.mediaFile.create({
          data: {
            bucket: options.bucket, // Orijinal bucket tipi (products, avatars, vs.)
            key, // Full S3 key (dev/products/...)
            filename,
            mimeType: contentType,
            size: buffer.length,
            uploaderId,
            entityType: options.entityType,
            entityId: options.entityId,
            isPublic: false, // Artık her şey private
            url: key, // URL yerine key saklanıyor, presigned URL endpoint'ten alınacak
          },
        });
      }

      this.logger.log(`✅ File uploaded (private): ${key}`);

      return {
        key,
        bucket: options.bucket, // Orijinal bucket tipi
        size: buffer.length,
        mimeType: options.mimeType || "application/octet-stream",
      };
    } catch (error: any) {
      this.logger.error(`❌ S3 upload error: ${error.message}`, error);
      throw new InternalServerErrorException("Dosya yükleme başarısız");
    }
  }

  /**
   * Bucket içi S3→S3 kopya. Paylaşılan kaynak objeleri (ör. seed-assets/)
   * env-prefix'li hedef key'lere sunucu tarafında kopyalar; indirme/yükleme olmaz.
   * sourceKey TAM key'dir (env prefix uygulanmaz), hedef key uploadFile ile aynı
   * desenle kurulur. ContentType/CacheControl kaynaktan aynen taşınır.
   */
  async copyFile(
    sourceKey: string,
    options: Pick<UploadOptions, "bucket" | "folder" | "filename">,
  ): Promise<{ key: string }> {
    if (!this.isS3Available) {
      throw new BadRequestException(
        "Dosya yükleme servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
      );
    }
    if (!this.bucketFolders[options.bucket]) {
      throw new BadRequestException(`Geçersiz bucket tipi: ${options.bucket}`);
    }

    const bucketFolder = this.bucketFolders[options.bucket];
    const customFolder = options.folder ? `${options.folder}/` : "";
    const filename = options.filename || crypto.randomBytes(16).toString("hex");
    const key = `${this.envPrefix}/${bucketFolder}/${customFolder}${filename}`;

    try {
      await this.s3Client!.send(
        new CopyObjectCommand({
          Bucket: this.baseBucket,
          CopySource: encodeURIComponent(`${this.baseBucket}/${sourceKey}`),
          Key: key,
          MetadataDirective: "COPY",
        }),
      );
      return { key };
    } catch (error: any) {
      this.logger.error(
        `❌ S3 copy error (${sourceKey} → ${key}): ${error.message}`,
      );
      throw new InternalServerErrorException("Dosya kopyalama başarısız");
    }
  }

  /**
   * Multiple files upload
   */
  async uploadFiles(
    files: Array<{ buffer: Buffer; mimeType: string; filename?: string }>,
    options: Omit<UploadOptions, "filename" | "mimeType">,
    uploaderId?: string,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadFile(
        file.buffer,
        {
          ...options,
          filename: file.filename,
          mimeType: file.mimeType,
        },
        uploaderId,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    // Database'den sil
    await this.prisma.mediaFile.deleteMany({
      where: { bucket, key },
    });

    // S3'ten sil
    if (this.isS3Available) {
      try {
        // Key zaten full path içeriyor (dev/products/...)
        // Eğer sadece relative key geliyorsa, env prefix ekle
        const fullKey = key.startsWith(this.envPrefix)
          ? key
          : `${this.envPrefix}/${this.bucketFolders[bucket as keyof typeof this.bucketFolders]}/${key}`;

        const command = new DeleteObjectCommand({
          Bucket: this.baseBucket,
          Key: fullKey,
        });

        await this.s3Client.send(command);
        this.logger.log(`✅ File deleted: ${fullKey}`);
      } catch (error: any) {
        this.logger.warn(`⚠️ S3 delete error: ${error.message}`);
      }
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(
    files: Array<{ bucket: string; key: string }>,
  ): Promise<void> {
    for (const file of files) {
      await this.deleteFile(file.bucket, file.key);
    }
  }

  /**
   * Build direct public URL for public-read S3 assets (product/collection images).
   * Key must include env prefix (e.g. dev/products/product-images/...).
   */
  getPublicAssetUrl(key: string): string {
    const baseUrl = this.configService.get("S3_PUBLIC_BASE_URL", "");
    if (!baseUrl) {
      this.logger.warn(
        "S3_PUBLIC_BASE_URL not configured; returning empty URL",
      );
      return "";
    }
    const normalizedKey = key.startsWith("/") ? key.slice(1) : key;
    return `${baseUrl.replace(/\/$/, "")}/${normalizedKey}`;
  }

  /**
   * Presigned URL for upload (client-side upload için)
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isS3Available) {
      throw new BadRequestException(
        "Dosya yükleme servisi şu anda kullanılamıyor.",
      );
    }

    const bucketFolder =
      this.bucketFolders[bucket as keyof typeof this.bucketFolders];
    if (!bucketFolder) {
      throw new BadRequestException(`Geçersiz bucket: ${bucket}`);
    }

    // Key zaten full path içeriyorsa kullan, değilse oluştur
    const fullKey = key.startsWith(this.envPrefix)
      ? key
      : `${this.envPrefix}/${bucketFolder}/${key}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.baseBucket,
        Key: fullKey,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirySeconds,
      });
    } catch (error: any) {
      this.logger.error(`❌ Presigned upload URL error: ${error.message}`);
      throw new InternalServerErrorException("Presigned URL oluşturulamadı");
    }
  }

  /**
   * Presigned URL for download - ANA ERİŞİM YÖNTEMİ
   * Tüm dosyalar bu yöntemle erişilir (private bucket)
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isS3Available) {
      throw new BadRequestException(
        "Dosya indirme servisi şu anda kullanılamıyor.",
      );
    }

    const bucketFolder =
      this.bucketFolders[bucket as keyof typeof this.bucketFolders];
    // Key zaten full path içeriyorsa kullan, değilse oluştur
    const fullKey = key.startsWith(this.envPrefix)
      ? key
      : `${this.envPrefix}/${bucketFolder}/${key}`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.baseBucket,
        Key: fullKey,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirySeconds,
      });
    } catch (error: any) {
      this.logger.error(`❌ Presigned download URL error: ${error.message}`);
      throw new InternalServerErrorException("Presigned URL oluşturulamadı");
    }
  }

  /**
   * Get files by entity - presigned URL'ler ile birlikte
   */
  async getFilesByEntity(
    entityType: string,
    entityId: string,
    includePresignedUrls = true,
    expirySeconds = 3600,
  ) {
    const files = await this.prisma.mediaFile.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
    });

    // Presigned URL'leri ekle
    if (includePresignedUrls && this.isS3Available) {
      const filesWithUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const presignedUrl = await this.getPresignedDownloadUrl(
              file.bucket,
              file.key,
              expirySeconds,
            );
            return {
              ...file,
              presignedUrl,
            };
          } catch (error) {
            this.logger.warn(
              `Failed to generate presigned URL for ${file.key}`,
            );
            return file;
          }
        }),
      );
      return filesWithUrls;
    }

    return files;
  }

  /**
   * Get file extension from mime type
   */
  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
    };
    return map[mimeType] || "";
  }

  /**
   * Validate image for product
   */
  async validateProductImage(
    buffer: Buffer,
  ): Promise<{ valid: boolean; reason?: string }> {
    if (buffer.length < 1024) {
      return { valid: false, reason: "Resim çok küçük" };
    }

    if (buffer.length > MAX_FILE_SIZE) {
      return { valid: false, reason: "Resim çok büyük (max 10MB)" };
    }

    return { valid: true };
  }
}
