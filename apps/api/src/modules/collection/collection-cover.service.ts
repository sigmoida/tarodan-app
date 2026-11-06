import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { MediaService } from "../media/media.service";
import {
  isSafePublicObjectKey,
  MAX_FILE_SIZE,
  StorageService,
} from "../storage/storage.service";
import { CollectionResponseDto } from "./dto";
import { CollectionCommonService } from "./collection-common.service";
import { fetchImageBytes } from "./helpers/fetch-image-bytes";
import { configureSharpSafety } from "../../common/image/sharp-safety";
import { PUBLIC_NAME_SELECT } from "../../common/helpers/public-identity";
import { errorMessage } from "../../common/helpers/error-message";
import { i18nMessage } from "../i18n";

type SharpFactory = typeof import("sharp");

// Sharp is optional. A load failure is not swallowed silently (see
// media.service: on staging an image without sharp could not be diagnosed from
// a single 400).
let sharp: SharpFactory | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sharp = configureSharpSafety(require("sharp") as SharpFactory);
} catch (e) {
  sharp = null;
  // eslint-disable-next-line no-console
  console.error(
    `[CollectionCoverService] sharp failed to load: ${errorMessage(e)}`,
  );
}

/** Source images are never larger than what an upload may store. */
const COVER_SOURCE_LIMITS = { maxBytes: MAX_FILE_SIZE, timeoutMs: 10_000 };

/** The item fields the cover generator reads. */
interface CoverSourceItem {
  id: string;
  customImageUrl: string | null;
  product: { images: { cardKey: string | null }[] } | null;
}

/**
 * CollectionCoverService: cover image work, updateCollectionCover and
 * generateCoverImage (a 2x2 grid or single cover built through media/storage).
 * generateCoverImage is also called by crud (this.cover.generateCoverImage), so
 * it stays public. mapCollectionToDto is delegated to common.
 *
 * Source images are only ever read from our own public storage: each item
 * yields an object key (`coverSourceKey`) and the download URL is rebuilt from
 * that key, so a stored URL on another host is never requested.
 */
@Injectable()
export class CollectionCoverService {
  private readonly logger = new Logger(CollectionCoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly storageService: StorageService,
    private readonly common: CollectionCommonService,
  ) {}

  // ==========================================================================
  // UPDATE COLLECTION COVER IMAGE
  // ==========================================================================
  async updateCollectionCover(
    collectionId: string,
    userId: string,
    coverImageKey: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException(i18nMessage("server.collection.notFound"));
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.collection.editForbidden"),
      );
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { coverImageKey },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        items: {
          include: {
            product: {
              include: {
                images: {
                  take: 1,
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return await this.common.mapCollectionToDto(updated, false);
  }

  // ==========================================================================
  // GENERATE COVER IMAGE FROM COLLECTION ITEMS
  // ==========================================================================

  /**
   * The object key of an item's cover source, or null to skip the item. A
   * custom image counts only when its stored URL is one of our own public
   * URLs; legacy or foreign URLs (another host, presigned, a bare key) are
   * skipped, never fetched. A listing uses its card image key.
   */
  private coverSourceKey(item: CoverSourceItem): string | null {
    if (item.customImageUrl) {
      const key = this.storageService.ownPublicAssetKey(item.customImageUrl);
      if (!key) {
        this.logger.warn(
          `Cover generation skipped a non-own image of collection item id=${item.id}`,
        );
      }
      return key;
    }
    const cardKey = item.product?.images?.[0]?.cardKey;
    return cardKey && isSafePublicObjectKey(cardKey) ? cardKey : null;
  }

  /** Downloads one of our own public objects by key, within fixed limits. */
  private async downloadImage(key: string): Promise<Buffer> {
    const url = this.storageService.getPublicAssetUrl(key);
    // Defence in depth: the rebuilt URL must still be one of ours.
    if (!url || this.storageService.ownPublicAssetKey(url) !== key) {
      throw new Error(`Refusing to download a non-own image key ${key}`);
    }
    return fetchImageBytes(url, COVER_SOURCE_LIMITS);
  }

  async generateCoverImage(collectionId: string): Promise<string | null> {
    if (!sharp) {
      this.logger.warn("Sharp not available, skipping cover image generation");
      return null;
    }

    try {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: {
                    take: 1,
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
            orderBy: { sortOrder: "asc" },
            take: 4,
          },
        },
      });

      if (!collection || collection.items.length === 0) {
        return null;
      }

      // Image keys from items (custom image on our storage, or listing card key)
      const imageKeys: string[] = [];
      for (const item of collection.items) {
        const key = this.coverSourceKey(item);
        if (key) imageKeys.push(key);
        if (imageKeys.length >= 4) break;
      }

      if (imageKeys.length === 0) {
        return null;
      }

      // If less than 4 images, use the first one
      if (imageKeys.length < 4) {
        try {
          const imageBuffer = await this.downloadImage(imageKeys[0]);
          const resizedBuffer = await sharp(imageBuffer)
            .autoOrient()
            .resize(1200, 600, { fit: "cover" })
            .toBuffer();

          // Upload to S3 using MediaService
          const uploadResult = await this.mediaService.uploadBuffer(
            resizedBuffer,
            {
              folder: "collection-covers",
              mimeType: "image/jpeg",
              bucket: "collections",
            },
          );

          await this.prisma.collection.update({
            where: { id: collectionId },
            data: { coverImageKey: uploadResult.key },
          });

          return uploadResult.key;
        } catch (error) {
          this.logger.error(
            `Failed to generate single cover image for collection id=${collectionId}: ${errorMessage(error)}`,
          );
          return null;
        }
      }

      // Download and resize images to 400x400
      const imageBuffers: Buffer[] = [];
      for (const key of imageKeys) {
        try {
          const buffer = await this.downloadImage(key);
          const resized = await sharp(buffer)
            .autoOrient()
            .resize(400, 400, { fit: "cover" })
            .toBuffer();
          imageBuffers.push(resized);
        } catch (error) {
          this.logger.warn(
            `Failed to download image ${key}: ${errorMessage(error)}`,
          );
        }
      }

      if (imageBuffers.length === 0) {
        return null;
      }

      // Create 2x2 grid (800x800)
      const gridWidth = 800;
      const gridHeight = 800;
      const cellWidth = 400;
      const cellHeight = 400;

      const composite = sharp({
        create: {
          width: gridWidth,
          height: gridHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      });

      const composites = [];
      for (let i = 0; i < Math.min(4, imageBuffers.length); i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        composites.push({
          input: imageBuffers[i],
          left: col * cellWidth,
          top: row * cellHeight,
        });
      }

      const finalBuffer = await composite
        .composite(composites)
        .jpeg()
        .toBuffer();

      // Upload to S3 using MediaService
      const uploadResult = await this.mediaService.uploadBuffer(finalBuffer, {
        folder: "collection-covers",
        mimeType: "image/jpeg",
        bucket: "collections",
      });

      await this.prisma.collection.update({
        where: { id: collectionId },
        data: { coverImageKey: uploadResult.key },
      });

      return uploadResult.key;
    } catch (error) {
      this.logger.error(
        `Failed to generate cover image for collection id=${collectionId}: ${errorMessage(error)}`,
      );
      return null;
    }
  }
}
