import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ListingRemovalReason,
  Prisma,
  ProductInactiveReason,
  ProductKind,
  ProductStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { SearchService } from "../../search/search.service";
import { MembershipService } from "../../membership/membership.service";
import { CommissionRuleGuardService } from "../../commission/commission-rule-guard.service";
import { errorMessage } from "../../../common/helpers/error-message";
import { i18nMessage } from "../../i18n";
import {
  PRODUCT_FINGERPRINT_SELECT,
  computeProductContentFingerprint,
  stampApprovedContentFingerprint,
} from "../helpers/product-content-fingerprint";
import {
  describeRenewalFailure,
  resolveRenewalStatus,
  sellerSaleBlock,
} from "../helpers/product-renewal";
import { assertListingMayReopen } from "../helpers/product-reopen-gate";
import { refreshProductVisibility } from "../helpers/product-visibility";
import { recordListingRemovals } from "../helpers/listing-removal";

/** Bir yenilemenin sonucu: yayına döndü ya da onaya düştü. */
export type RenewalOutcomeStatus =
  typeof ProductStatus.active | typeof ProductStatus.pending;

export type RenewalItemResult =
  | { id: string; ok: true; status: RenewalOutcomeStatus }
  | {
      id: string;
      ok: false;
      /** Katalog anahtarı — istemci kendi dilinde yeniden çizer. */
      errorKey: string;
      errorParams?: Record<string, unknown>;
    };

export interface RenewalBatchResult {
  results: RenewalItemResult[];
  /** Doğrudan yayına dönenler. */
  renewed: number;
  /** İçeriği değiştiği/onay izi olmadığı için onaya düşenler. */
  submitted: number;
  failed: number;
}

/** Yenileme kararının okuduğu alanlar (içerik izi + kapılar + satıcı durumu). */
const RENEWAL_SELECT = {
  id: true,
  sellerId: true,
  kind: true,
  status: true,
  inactiveReason: true,
  quantity: true,
  price: true,
  approvedContentFingerprint: true,
  ...PRODUCT_FINGERPRINT_SELECT,
  seller: {
    select: {
      isBanned: true,
      businessStatus: true,
      companyName: true,
      taxId: true,
      membership: {
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: { select: { type: true, isActive: true } },
        },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

type RenewalProduct = Prisma.ProductGetPayload<{
  select: typeof RENEWAL_SELECT;
}>;

/**
 * Süresi dolmuş (`inactiveReason = expired`) ilanın yeniden yayına alınması.
 *
 *  - Satıcı yenilemesi (tek / toplu): içerik SON ONAYDAN beri değişmediyse ilan
 *    moderasyon kuyruğuna girmeden yayına döner ve ömrü yeniden başlar; değiştiyse
 *    (ya da onay izi yoksa) normal onay kuralı (`pending`) geçerlidir.
 *  - Admin reaktivasyonu (tek seferlik bakım): yönetici kararı onay sayılır.
 *
 * İki yolda da ESKİ kapıların hepsi çalışır (stok, üyelik ilan limiti, komisyon
 * kuralı, banlı/askıdaki satıcı) — bkz. `assertListingMayReopen` ve
 * `sellerSaleBlock`; yenileme bir bypass değil, moderasyon adımının atlanmasıdır.
 */
@Injectable()
export class ProductRenewalService {
  private readonly logger = new Logger(ProductRenewalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    private readonly membershipService: MembershipService,
    private readonly commissionGuard: CommissionRuleGuardService,
  ) {}

  /** Satıcı: tek ilanı yenile. Hata semantik istisna olarak fırlar. */
  async renew(
    sellerId: string,
    productId: string,
  ): Promise<{ id: string; status: RenewalOutcomeStatus }> {
    const product = await this.loadForRenewal(productId);
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(i18nMessage("server.product.editForbidden"));
    }
    this.assertRenewable(product);
    await this.assertGates(product);

    // "Değişmedi" kararı: güncel içeriğin izi son onaydaki izle aynı mı.
    const status = resolveRenewalStatus(
      product,
      computeProductContentFingerprint(product),
    );
    await this.commit(product.id, status);
    return { id: product.id, status };
  }

  /**
   * Satıcı: birden çok ilanı yenile. Her ilan KENDİ sonucuyla döner — biri
   * (ör. limit dolduğu için) düşerse diğerleri etkilenmez ve istemci hangisinin
   * neden başarısız olduğunu görür. SIRALI çalışır: limit her ilandan önce
   * güncel sayıdan okunur, paralel koşu limiti aşardı.
   */
  async renewMany(
    sellerId: string,
    productIds: readonly string[],
  ): Promise<RenewalBatchResult> {
    const results: RenewalItemResult[] = [];
    for (const id of [...new Set(productIds)]) {
      try {
        const { status } = await this.renew(sellerId, id);
        results.push({ id, ok: true, status });
      } catch (error) {
        results.push(this.failureOf(id, error));
      }
    }
    return {
      results,
      renewed: results.filter((r) => r.ok && r.status === ProductStatus.active)
        .length,
      submitted: results.filter(
        (r) => r.ok && r.status === ProductStatus.pending,
      ).length,
      failed: results.filter((r) => !r.ok).length,
    };
  }

  /**
   * Admin reaktivasyonu (tek seferlik bakım): yönetici kararı onay yerine geçer
   * → ilan doğrudan yayına döner, ömrü yeniden başlar ve güncel içerik "onaylı
   * içerik" olarak damgalanır. Kapılar (stok, limit, komisyon, satıcı) aynen çalışır.
   */
  async reactivateByAdmin(productId: string): Promise<void> {
    const product = await this.loadForRenewal(productId);
    this.assertRenewable(product);
    await this.assertGates(product);
    await this.commit(product.id, ProductStatus.active);
    await stampApprovedContentFingerprint(this.prisma, product.id);
  }

  /**
   * "Süresi doldu" işareti koy (tek seferlik bakım): yalnız pasif + nedeni
   * boş + gerçek ilan olanlara. Statüye dokunmaz. `stampBaseline` açıksa güncel
   * içerik onaylı sayılır (yönetici kararı) → satıcı yenilemesi doğrudan yayına
   * döner; kapalıysa yenileme normal onay kuralından geçer.
   *
   * İşaret değişimi bir yeniden sınıflandırmadır: ilan pasif kalır ama nedeni
   * artık "süresi doldu"dur — aynı transaction'da kaldırma kaydı düşülür ve
   * güncel neden onu izler. İlan zaten vitrinde değildi, bu yüzden dashboard'ın
   * "vitrinden düşen" sayısına girmez.
   */
  async markExpired(
    productIds: readonly string[],
    options: { stampBaseline?: boolean } = {},
  ): Promise<string[]> {
    const marked: string[] = [];
    for (const id of productIds) {
      const count = await this.prisma.$transaction(async (tx) => {
        const res = await tx.product.updateMany({
          where: {
            id,
            kind: ProductKind.listing,
            status: ProductStatus.inactive,
            inactiveReason: null,
          },
          data: { inactiveReason: ProductInactiveReason.expired },
        });
        if (res.count > 0) {
          await recordListingRemovals(tx, [
            {
              productId: id,
              statusBefore: ProductStatus.inactive,
              statusAfter: ProductStatus.inactive,
              inactiveReasonBefore: null,
              inactiveReasonAfter: ProductInactiveReason.expired,
              reason: ListingRemovalReason.expired,
            },
          ]);
        }
        return res.count;
      });
      if (count === 0) continue;
      marked.push(id);
      if (options.stampBaseline) {
        await stampApprovedContentFingerprint(this.prisma, id);
      }
    }
    return marked;
  }

  /** İlan değişti: önbellek + arama dizini + web ISR (mevcut statü yazımlarıyla aynı). */
  refreshVisibility(productIds: readonly string[]): Promise<void> {
    return refreshProductVisibility(
      {
        cache: this.cache,
        searchService: this.searchService,
        logger: this.logger,
      },
      productIds,
    );
  }

  // ── iç ──────────────────────────────────────────────────────────────────

  private async loadForRenewal(productId: string): Promise<RenewalProduct> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: RENEWAL_SELECT,
    });
    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    return product;
  }

  /** Yalnız süresi dolmuş gerçek ilan yenilenir; satıcı banlı/askıda olmamalı. */
  private assertRenewable(product: RenewalProduct): void {
    if (
      product.kind !== ProductKind.listing ||
      product.status !== ProductStatus.inactive ||
      product.inactiveReason !== ProductInactiveReason.expired
    ) {
      throw new BadRequestException(
        i18nMessage("server.product.renewNotExpired"),
      );
    }
    const block = sellerSaleBlock(product.seller);
    if (block === "banned") {
      throw new ForbiddenException(
        i18nMessage("server.product.bannedCannotEdit"),
      );
    }
    if (block === "corporate_suspended") {
      throw new ForbiddenException(
        i18nMessage("server.product.corporateSalesSuspended"),
      );
    }
  }

  private assertGates(product: RenewalProduct): Promise<void> {
    return assertListingMayReopen(
      {
        membershipService: this.membershipService,
        commissionGuard: this.commissionGuard,
      },
      product,
    );
  }

  /**
   * Koşullu yazım: ilan hâlâ "süresi dolmuş" ise yazılır — eşzamanlı bir
   * düzenleme/yenileme/silme araya girdiyse hiçbir şey yazılmaz (409). Yayına
   * dönen ilan taze ömür alır (publishedAt); `pending`te onay tazeler.
   * `inactiveReason` burada ELLE temizlenmez: statü `inactive` dışına çıktığı
   * için PrismaService middleware'i temizler (tek entegrasyon noktası).
   */
  private async commit(
    productId: string,
    status: RenewalOutcomeStatus,
  ): Promise<void> {
    const res = await this.prisma.product.updateMany({
      where: {
        id: productId,
        status: ProductStatus.inactive,
        inactiveReason: ProductInactiveReason.expired,
      },
      data: {
        status,
        version: { increment: 1 },
        ...(status === ProductStatus.active ? { publishedAt: new Date() } : {}),
      },
    });
    if (res.count === 0) {
      throw new ConflictException(i18nMessage("server.product.updateConflict"));
    }
    await this.refreshVisibility([productId]);
  }

  private failureOf(
    id: string,
    error: unknown,
  ): Extract<RenewalItemResult, { ok: false }> {
    const { unexpected, ...failure } = describeRenewalFailure(error);
    if (unexpected) {
      this.logger.error(`Renewal failed for ${id}: ${errorMessage(error)}`);
    }
    return { id, ok: false, ...failure };
  }
}
