import { Injectable, Logger, Optional } from "@nestjs/common";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";

/**
 * UserCommonService — kullanıcı alt servislerinin paylaştığı yardımcılar.
 * resolveAvatarUrl (avatar S3 key → presigned URL) profile/social/analytics/
 * discovery taraflarınca; resolveProductImageUrl (ürün görsel key → public URL)
 * analytics/discovery taraflarınca kullanılır. İkisi de private→public'e çekildi;
 * alt servisler this.common.* üzerinden erişir. Leaf: yalnız @Optional
 * StorageService inject eder (storage yoksa null döner — davranış korunur).
 */
@Injectable()
export class UserCommonService {
  private readonly logger = new Logger(UserCommonService.name);

  constructor(
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  /**
   * Resolve avatarUrl - if it's an S3 key, generate presigned URL
   * If it's already an http(s) URL, return as-is
   */
  async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    // Already a full URL - return as-is
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    // S3 key - resolve to presigned URL
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl(
          "avatars",
          avatarUrl,
          86400,
        ); // 24 hours
      } catch (e: any) {
        this.logger.warn(
          `Failed to resolve avatar presigned URL for key: ${avatarUrl} - ${e.message}`,
        );
        return null;
      }
    }
    return null;
  }

  resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    if (isPublicStorageKey(imageKeyOrUrl)) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }
}
