import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";
import { activeListingWhere } from "../product/helpers/active-listing-where";
import { i18nMessage } from "../i18n";

@Injectable()
export class ManufacturerService {
  private readonly logger = new Logger(ManufacturerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private resolveLogoUrl(logo: string | null | undefined): string | null {
    if (!logo) return null;
    // Faz 1: eski repo yolları ("/photos/logolar/…") null'a düşer — statikler
    // kaldırıldı, logolar bucket'tan ({env}/brands/{slug}) servis edilir.
    if (logo.startsWith("/")) return null;

    // If stored value is a presigned S3 URL, extract the key and use permanent public URL
    if (logo.startsWith("http://") || logo.startsWith("https://")) {
      try {
        const url = new URL(logo);
        const pathKey = url.pathname.substring(1);
        if (isPublicStorageKey(pathKey)) {
          return this.storageService.getPublicAssetUrl(pathKey) || logo;
        }
      } catch {
        /* not a valid URL, return as-is */
      }
      return logo;
    }

    if (isPublicStorageKey(logo)) {
      return this.storageService.getPublicAssetUrl(logo) || null;
    }
    return logo;
  }

  /**
   * `hasListings`: yalnız en az bir aktif ilanı olan üreticiler (web vitrini
   * boş üretici göstermez). Sayaçla AYNI predikat — EXISTS alt sorgusu.
   */
  async findAll(options: { hasListings?: boolean } = {}) {
    const manufacturers = await this.prisma.manufacturer.findMany({
      where: {
        isActive: true,
        ...(options.hasListings
          ? { products: { some: activeListingWhere() } }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        country: true,
        foundedYear: true,
        _count: {
          select: {
            products: {
              where: activeListingWhere(),
            },
          },
        },
      },
    });
    return manufacturers.map((m) => ({
      ...m,
      logo: this.resolveLogoUrl(m.logo),
    }));
  }

  async findBySlug(slug: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        website: true,
        country: true,
        foundedYear: true,
        _count: {
          select: {
            products: {
              where: activeListingWhere(),
            },
          },
        },
      },
    });
    if (!manufacturer) {
      throw new NotFoundException(
        i18nMessage("server.manufacturer.notFoundBySlug", { slug: slug }),
      );
    }
    return {
      ...manufacturer,
      logo: this.resolveLogoUrl(manufacturer.logo),
      productCount: manufacturer._count.products,
    };
  }

  async findOne(id: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        website: true,
        country: true,
        foundedYear: true,
        _count: {
          select: {
            products: {
              where: activeListingWhere(),
            },
          },
        },
      },
    });
    if (!manufacturer) {
      throw new NotFoundException(i18nMessage("server.manufacturer.notFound"));
    }
    return {
      ...manufacturer,
      logo: this.resolveLogoUrl(manufacturer.logo),
      productCount: manufacturer._count.products,
    };
  }
}
