import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  CreateAdPackageDto,
  UpdateAdPackageDto,
  AdPackageTierDto,
} from "./dto/ad-package.dto";

/**
 * Admin management of the dynamic ad/boost packages (Ekonomik / Vitrin / …) and
 * their price tiers, plus read-only tracking of every boost purchase (who bought
 * which package for which product, when, for how much).
 */
@Injectable()
export class AdminAdPackageService {
  constructor(private readonly prisma: PrismaService) {}

  private tierData(t: AdPackageTierDto) {
    return {
      durationDays: t.durationDays,
      minAmount: new Prisma.Decimal(t.minAmount),
      maxAmount: t.maxAmount == null ? null : new Prisma.Decimal(t.maxAmount),
      price: new Prisma.Decimal(t.price),
      campaignPrice:
        t.campaignPrice == null ? null : new Prisma.Decimal(t.campaignPrice),
      campaignStartsAt: t.campaignStartsAt
        ? new Date(t.campaignStartsAt)
        : null,
      campaignEndsAt: t.campaignEndsAt ? new Date(t.campaignEndsAt) : null,
      isActive: t.isActive ?? true,
    };
  }

  private serialize(pkg: any) {
    return {
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
      showcaseOnHome: pkg.showcaseOnHome,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      createdAt: pkg.createdAt,
      tiers: (pkg.tiers ?? []).map((t: any) => ({
        id: t.id,
        durationDays: t.durationDays,
        minAmount: Number(t.minAmount),
        maxAmount: t.maxAmount == null ? null : Number(t.maxAmount),
        price: Number(t.price),
        campaignPrice: t.campaignPrice == null ? null : Number(t.campaignPrice),
        campaignStartsAt: t.campaignStartsAt,
        campaignEndsAt: t.campaignEndsAt,
        isActive: t.isActive,
      })),
    };
  }

  async listPackages() {
    const packages = await this.prisma.adPackage.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tiers: { orderBy: [{ durationDays: "asc" }, { minAmount: "asc" }] },
      },
    });
    return { data: packages.map((p) => this.serialize(p)) };
  }

  async createPackage(dto: CreateAdPackageDto) {
    const existing = await this.prisma.adPackage.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException("Bu slug ile bir paket zaten var");
    }
    const pkg = await this.prisma.adPackage.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        showcaseOnHome: dto.showcaseOnHome ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        tiers: dto.tiers?.length
          ? { create: dto.tiers.map((t) => this.tierData(t)) }
          : undefined,
      },
      include: { tiers: true },
    });
    return this.serialize(pkg);
  }

  async updatePackage(id: string, dto: UpdateAdPackageDto) {
    const pkg = await this.prisma.adPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException("Paket bulunamadı");

    if (dto.slug && dto.slug !== pkg.slug) {
      const clash = await this.prisma.adPackage.findUnique({
        where: { slug: dto.slug },
      });
      if (clash)
        throw new BadRequestException("Bu slug ile bir paket zaten var");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.adPackage.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          slug: dto.slug ?? undefined,
          showcaseOnHome: dto.showcaseOnHome ?? undefined,
          isActive: dto.isActive ?? undefined,
          sortOrder: dto.sortOrder ?? undefined,
        },
      });
      // "satır ekle/çıkar": verilirse kademe satırları toptan değiştirilir.
      if (dto.tiers) {
        await tx.adPackageTier.deleteMany({ where: { packageId: id } });
        if (dto.tiers.length) {
          await tx.adPackageTier.createMany({
            data: dto.tiers.map((t) => ({
              packageId: id,
              ...this.tierData(t),
            })),
          });
        }
      }
      return tx.adPackage.findUnique({
        where: { id },
        include: {
          tiers: { orderBy: [{ durationDays: "asc" }, { minAmount: "asc" }] },
        },
      });
    });
    return this.serialize(updated);
  }

  async deletePackage(id: string) {
    const pkg = await this.prisma.adPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException("Paket bulunamadı");
    // Cascade deletes tiers; ProductBoost.packageId → SetNull (geçmiş korunur).
    await this.prisma.adPackage.delete({ where: { id } });
    return { success: true };
  }

  /** Boost satın alma takibi: kim, hangi ürün, hangi paket, ne zaman, ne kadar. */
  async listPurchases(query: {
    page?: number;
    limit?: number;
    packageId?: string;
    status?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, packageId, status, search } = query;
    const where: Prisma.ProductBoostWhereInput = {};
    if (packageId) where.packageId = packageId;
    if (status) where.status = status as any;
    const term = search?.trim();
    if (term) {
      where.OR = [
        { product: { title: { contains: term, mode: "insensitive" } } },
        { user: { displayName: { contains: term, mode: "insensitive" } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
        { packageName: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, boosts] = await Promise.all([
      this.prisma.productBoost.count({ where }),
      this.prisma.productBoost.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          package: { select: { id: true, name: true } },
          product: { select: { id: true, title: true } },
        },
      }),
    ]);

    return {
      data: boosts.map((b) => ({
        id: b.id,
        buyer: b.user
          ? { id: b.user.id, name: b.user.displayName, email: b.user.email }
          : null,
        product: b.product
          ? { id: b.product.id, title: b.product.title }
          : null,
        packageName: b.packageName ?? b.package?.name ?? null,
        showcaseOnHome: b.showcaseOnHome,
        durationDays: b.durationDays,
        price: Number(b.price),
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        purchasedAt: b.purchasedAt,
        createdAt: b.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
