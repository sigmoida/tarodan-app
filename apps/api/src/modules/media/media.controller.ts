import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  Request,
  Res,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { UPLOAD_MULTER_OPTIONS } from "../../common/upload/multer-options";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MediaService, UploadOptions, UploadResult } from "./media.service";
import { MembershipService } from "../membership/membership.service";
import { StorageService, isPublicBucket } from "../storage/storage.service";
import { MediaAccessService } from "../storage/media-access.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { MAX_PRODUCT_IMAGES } from "../product/helpers/product-image-keys";
import { resolveUploadTarget } from "./upload-target";

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly membershipService: MembershipService,
    private readonly storageService: StorageService,
    private readonly mediaAccess: MediaAccessService,
    private readonly moderationAi: ModerationAiClient,
  ) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", UPLOAD_MULTER_OPTIONS))
  async uploadFile(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query("folder") folder?: string,
    @Query("resize") resize?: string,
    @Query("thumbnail") thumbnail?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    // Faz 0: klasör SÖZLEŞMESİ sunucuda — `folder` yalnız amaç etiketi,
    // bucket + gerçek klasörü whitelist kurar (istemci klasör açamaz).
    const target = resolveUploadTarget(folder, req.user.id);

    // Yüklenen her görseli AI ile denetle (uygunsuz/NSFW → engelle)
    await this.moderationAi.assertImageClean(file, {
      entityType: "upload",
      userId: req.user?.id,
      field: folder || "upload",
    });

    const options: UploadOptions = {
      bucket: target.bucket,
      folder: target.folder,
      generateThumbnail: thumbnail === "true",
    };

    if (resize) {
      const [width, height] = resize.split("x").map(Number);
      if (width && height) {
        options.resize = { width, height };
      }
    }

    const result = await this.mediaService.upload(file, options, req.user.id);
    // Private hedef (messages): istemciye public S3 URL'si DEĞİL, kalıcı
    // yetkili servis ucu döner — Message.content'e bu gömülür.
    if (target.private && result.mediaFileId) {
      result.url = this.mediaService.buildMessageAttachmentUrl(
        result.mediaFileId,
      );
    }
    return result;
  }

  /**
   * Faz 0: private mesaj ekini presigned URL'e yönlendirir. JWT zorunlu
   * (sınıf guard'ı); yalnız `messages` kökündeki dosyalar çözülür.
   */
  @Get("message-attachment/:id")
  async messageAttachment(@Param("id") id: string, @Res() res: any) {
    const url = await this.mediaService.getMessageAttachmentPresignedUrl(id);
    return res.redirect(url);
  }

  @Post("upload/multiple")
  @UseInterceptors(FilesInterceptor("files", 10, UPLOAD_MULTER_OPTIONS))
  async uploadMultipleFiles(
    @Request() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("folder") folder?: string,
    @Query("thumbnail") thumbnail?: string,
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException("No files provided");
    }

    const target = resolveUploadTarget(folder, req.user.id);
    const options: UploadOptions = {
      bucket: target.bucket,
      folder: target.folder,
      generateThumbnail: thumbnail === "true",
    };

    const results = await this.mediaService.uploadMultiple(
      files,
      options,
      req.user.id,
    );
    if (target.private) {
      for (const result of results) {
        if (result.mediaFileId) {
          result.url = this.mediaService.buildMessageAttachmentUrl(
            result.mediaFileId,
          );
        }
      }
    }
    return results;
  }

  @Post("upload/product")
  // Mutlak tavan tek kaynaktan (MAX_PRODUCT_IMAGES); katmana bağlı gerçek
  // limit aşağıda üyelikten okunur.
  @UseInterceptors(
    FilesInterceptor("images", MAX_PRODUCT_IMAGES, UPLOAD_MULTER_OPTIONS),
  )
  async uploadProductImages(
    @Request() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("productId") productId?: string,
  ): Promise<
    Array<{
      cardKey: string;
      detailKey: string;
      cardUrl: string;
      detailUrl: string;
    }>
  > {
    if (!files || files.length === 0) {
      throw new BadRequestException("No files provided");
    }

    const membership = await this.membershipService.getUserMembership(
      req.user.id,
    );
    const maxImages = membership.tier.maxImagesPerListing;

    if (files.length > maxImages) {
      throw new BadRequestException(
        `En fazla ${maxImages} resim yükleyebilirsiniz`,
      );
    }

    for (const file of files) {
      await this.moderationAi.assertImageClean(file, {
        entityType: "product",
        entityId: productId,
        userId: req.user?.id,
        field: "product_image",
      });
    }

    const results = await Promise.all(
      files.map((file) =>
        this.mediaService.uploadProductImageVariants(file, req.user.id),
      ),
    );
    return results.map((r) => ({
      cardKey: r.cardKey,
      detailKey: r.detailKey,
      cardUrl: this.storageService.getPublicAssetUrl(r.cardKey),
      detailUrl: this.storageService.getPublicAssetUrl(r.detailKey),
    }));
  }

  @Post("upload/avatar")
  @UseInterceptors(FileInterceptor("avatar", UPLOAD_MULTER_OPTIONS))
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    await this.moderationAi.assertImageClean(file, {
      entityType: "user",
      entityId: req.user?.id,
      userId: req.user?.id,
      field: "avatar",
    });

    return this.mediaService.upload(
      file,
      {
        bucket: "avatars",
        folder: req.user.id,
        resize: { width: 300, height: 300, fit: "cover" },
        allowedTypes: ["image/jpeg", "image/png", "image/webp"],
        maxSize: 2 * 1024 * 1024, // 2MB
        entityType: "user",
        entityId: req.user.id,
      },
      req.user.id,
    );
  }

  /**
   * Public asset (ürün/koleksiyon/avatar) için doğrudan görüntüleme URL'i.
   * GET /media/public-url/*  (key tam yol: {env}/{bucket}/...)
   *
   * Bucket, KEY'in kendisinden türetilir (client'a güvenilmez); yalnızca
   * PUBLIC bucket'lara izin verilir. Private içerik kendi yetkili modülünden okunur.
   */
  @Get("public-url/*")
  getPublicUrl(@Param() params: any): { url: string } {
    const key = params["0"] as string;
    const bucketFolder = key?.split("/")[1] ?? "";
    if (!isPublicBucket(bucketFolder)) {
      throw new BadRequestException(
        "Bu içerik için herkese açık URL verilemez.",
      );
    }
    return { url: this.storageService.getPublicAssetUrl(key) };
  }

  /**
   * Dosya sil — yalnızca dosyayı yükleyen veya admin.
   * Key tam yol içerebileceği için wildcard ile yakalanır.
   * DELETE /media/file/*
   */
  @Delete("file/*")
  async deleteFile(
    @Request() req: any,
    @Param() params: any,
  ): Promise<{ success: boolean }> {
    const key = params["0"];
    const file = await this.mediaAccess.assertCanModify(key, req.user);
    await this.storageService.deleteFile(file.bucket, file.key);
    return { success: true };
  }
}
