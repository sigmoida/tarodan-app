import { Injectable } from "@nestjs/common";
import {
  BoostStatus,
  PaymentHoldStatus,
  ProductKind,
  ProductStatus,
  SellerAdjustmentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import type {
  DashboardMembershipTierCount,
  DashboardStockResponse,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import {
  LIVE_PAYMENT,
  LIVE_PRODUCT,
  LIVE_PRODUCT_BOOST,
  LIVE_USER_MEMBERSHIP,
} from "../../../account-lane/live-lane.where";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Zone D — "Şu anki durum". STOK büyüklükleri: bir anın fotoğrafı, dönem akışı
 * değil. Bu yüzden tarih filtresine hiç bakmaz — "escrow'da şu an ne kadar
 * para var" sorusunun dönemi yoktur.
 *
 * Aktif üyeliklerin katman kırılımını bugün hiçbir admin ekranı göstermiyor;
 * üyelik gelirinin nereden geldiğini ancak bu kırılım anlatıyor.
 *
 * Test şeridi hariç: test escrow'unda gerçek para yok, test ilanı/üyeliği/
 * öne çıkarması canlı pazarın büyüklüğü değil.
 */
@Injectable()
export class AdminDashboardStockService {
  /** Bakiyeler dakikalar içinde anlamlı ölçüde değişmez: 60 sn yeterli. */
  // v2: test şeridi dışlandı.
  static readonly CACHE_KEY = "admin:dashboard:stock:v2";
  static readonly CACHE_TTL_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getStock(): Promise<DashboardStockResponse> {
    return this.cache.getOrSet(
      AdminDashboardStockService.CACHE_KEY,
      () => this.buildStock(),
      { ttl: AdminDashboardStockService.CACHE_TTL_SECONDS },
    );
  }

  async invalidate(): Promise<void> {
    await this.cache.del(AdminDashboardStockService.CACHE_KEY);
  }

  private async buildStock(): Promise<DashboardStockResponse> {
    // Katman kırılımı SQL'de gruplanır; satırları çekip bellekte saymak
    // (rapor uçlarındaki eski kalıp) üyelik sayısıyla birlikte büyürdü.
    // Sorgu $transaction dizisinin içinde değil kendi değişkeninde kurulur:
    // dizi içinde yazıldığında Prisma'nın generic'i çözülmüyor ve satır tipi
    // `_count: true | {...}` birleşimine düşüyor. PrismaPromise tembel
    // olduğundan yürütme yine transaction içinde olur.
    const byTierQuery = this.prisma.userMembership.groupBy({
      by: ["tierId"],
      where: { ...LIVE_USER_MEMBERSHIP, status: SubscriptionStatus.active },
      _count: { id: true },
    });

    const [escrow, debt, listings, memberships, boosts, byTier] =
      await this.prisma.$transaction([
        // Escrow'da GERÇEKTEN duran para = tutulan − kısmi iadelerle tüketilen.
        this.prisma.paymentHold.aggregate({
          where: { payment: LIVE_PAYMENT, status: PaymentHoldStatus.held },
          _sum: { amount: true, refundedAmount: true },
        }),
        this.prisma.sellerAccountAdjustment.aggregate({
          where: { status: SellerAdjustmentStatus.open },
          _sum: { remainingAmount: true },
        }),
        this.prisma.product.count({
          where: {
            ...LIVE_PRODUCT,
            kind: ProductKind.listing,
            status: ProductStatus.active,
          },
        }),
        this.prisma.userMembership.count({
          where: { ...LIVE_USER_MEMBERSHIP, status: SubscriptionStatus.active },
        }),
        this.prisma.productBoost.count({
          where: { ...LIVE_PRODUCT_BOOST, status: BoostStatus.active },
        }),
        byTierQuery,
      ]);

    const tierIds = byTier.map((row) => row.tierId);
    const tiers = tierIds.length
      ? await this.prisma.membershipTier.findMany({
          where: { id: { in: tierIds } },
          select: { id: true, name: true, type: true },
        })
      : [];
    const tierById = new Map(tiers.map((tier) => [tier.id, tier]));

    const membershipsByTier: DashboardMembershipTierCount[] = byTier
      .map((row) => ({
        tierType: tierById.get(row.tierId)?.type ?? "unknown",
        tierName: tierById.get(row.tierId)?.name ?? row.tierId,
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      generatedAt: new Date().toISOString(),
      values: {
        escrowBalance: round2(
          Number(escrow._sum.amount ?? 0) -
            Number(escrow._sum.refundedAmount ?? 0),
        ),
        openSellerDebt: round2(Number(debt._sum.remainingAmount ?? 0)),
        activeListings: listings,
        activeMemberships: memberships,
        activeBoosts: boosts,
      },
      membershipsByTier,
    };
  }
}
