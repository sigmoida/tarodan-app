import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService, isPublicStorageKey } from "../storage/storage.service";
import { i18nMessage } from "../i18n";

export interface AdminMediaFile {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  /** Yalnız public köklerde (products/collections/avatars/reviews/brands). */
  publicUrl: string | null;
  /** Dosyanın bağlı olduğu kayıt; null = sahipsiz (ekranda ayırt edilir). */
  usage: { type: string; label: string } | null;
}

export interface AdminMediaBrowseResult {
  prefix: string;
  folders: Array<{ name: string; prefix: string }>;
  files: AdminMediaFile[];
}

/**
 * Faz 3 — Admin Medya tarayıcısı (read-only). Bucket klasör düzeni UI'dan
 * takip edilir: klasör ağacı + dosyalar + her dosyanın hangi kayda bağlı
 * olduğu. Private köklerin (messages/documents/tickets) dosyaları listelenir
 * ama publicUrl almaz — içerik yalnız kendi yetkili ucundan servis edilir.
 * Yazma/silme bilinçli olarak YOK (v2; MediaAccessService kurallarıyla gelir).
 */
@Injectable()
export class AdminMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async browse(prefix = ""): Promise<AdminMediaBrowseResult> {
    const clean = prefix.replace(/^\/+/, "");
    if (clean.includes("..")) {
      throw new BadRequestException(
        i18nMessage("server.admin.media.invalidFolder"),
      );
    }

    const listing = await this.storage.listFolder(clean);

    const folders = listing.folders.map((full) => {
      const trimmed = full.replace(/\/$/, "");
      return { name: trimmed.split("/").pop() ?? trimmed, prefix: full };
    });

    const usageByKey = await this.mapUsage(listing.files.map((f) => f.key));

    return {
      prefix: clean,
      folders,
      files: listing.files.map((file) => ({
        key: file.key,
        name: file.key.split("/").pop() ?? file.key,
        size: file.size,
        lastModified: file.lastModified,
        publicUrl: isPublicStorageKey(file.key)
          ? this.storage.getPublicAssetUrl(file.key) || null
          : null,
        usage: usageByKey.get(file.key) ?? null,
      })),
    };
  }

  /**
   * Dosya → kayıt eşlemesi (tek geçişte, key listesi sayfa boyutuyla sınırlı).
   * Öncelik: ürün > koleksiyon > üretici logosu > avatar > ham yükleme.
   */
  private async mapUsage(
    keys: string[],
  ): Promise<Map<string, { type: string; label: string }>> {
    const usage = new Map<string, { type: string; label: string }>();
    if (keys.length === 0) return usage;

    const [productImages, collections, manufacturers, users, mediaFiles] =
      await Promise.all([
        this.prisma.productImage.findMany({
          where: {
            OR: [{ cardKey: { in: keys } }, { detailKey: { in: keys } }],
          },
          select: {
            cardKey: true,
            detailKey: true,
            product: { select: { id: true, title: true } },
          },
        }),
        this.prisma.collection.findMany({
          where: { coverImageKey: { in: keys } },
          select: { coverImageKey: true, name: true },
        }),
        this.prisma.manufacturer.findMany({
          where: { logo: { in: keys } },
          select: { logo: true, name: true },
        }),
        this.prisma.user.findMany({
          where: { avatarUrl: { in: keys } },
          select: { avatarUrl: true, displayName: true, email: true },
        }),
        this.prisma.mediaFile.findMany({
          where: { key: { in: keys } },
          select: { key: true, entityType: true, uploaderId: true },
        }),
      ]);

    // Ters öncelik sırasıyla yaz — sonra yazılan (yüksek öncelik) ezer.
    for (const mf of mediaFiles) {
      usage.set(mf.key, {
        type: "upload",
        label: mf.entityType || mf.uploaderId || "yükleme",
      });
    }
    for (const u of users) {
      if (u.avatarUrl)
        usage.set(u.avatarUrl, {
          type: "avatar",
          label: u.displayName || u.email,
        });
    }
    for (const m of manufacturers) {
      if (m.logo) usage.set(m.logo, { type: "brand", label: m.name });
    }
    for (const c of collections) {
      if (c.coverImageKey)
        usage.set(c.coverImageKey, { type: "collection", label: c.name });
    }
    for (const pi of productImages) {
      const label = pi.product?.title ?? "ürün";
      usage.set(pi.cardKey, { type: "product", label });
      usage.set(pi.detailKey, { type: "product", label });
    }
    return usage;
  }
}
