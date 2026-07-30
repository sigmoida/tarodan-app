import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Prisma,
  ShippingPackageTier,
  ShippingPackageTierCode,
  ShippingTariff,
  ShippingTariffStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { SHIPPING_PACKAGE_TIER_ORDER } from "./shipping-package-tier";
import {
  outboundPackageShipping,
  shippingAmountForDesi,
} from "./shipping-tariff.helper";

const DEFAULT_PROVIDER = "surat";
/**
 * Tarife her okunduğunda kademeler de gelmeli: fiyat artık kademelerden çözülür
 * (shippingAmountForDesi). Tek yerde tanımlı olması, bir okuma yolunun kademesiz
 * tarife döndürüp checkout'u fail-closed'a düşürmesini engeller.
 */
const TARIFF_INCLUDE = {
  packageTiers: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ShippingTariffInclude;
export type ShippingTariffWithRates = ShippingTariff & {
  packageTiers: ShippingPackageTier[];
};

export interface ShippingPackageTierInput {
  code: ShippingPackageTierCode;
  label: string;
  minDesi: number;
  /** null = üst sınırsız; son kademe böyle olmalıdır. */
  maxDesi: number | null;
  amount: number;
  sampleWidth?: number | null;
  sampleHeight?: number | null;
  sampleLength?: number | null;
}

export interface ShippingTariffInput {
  provider?: string;
  name: string;
  outboundPackageFee: number;
  freeShippingEnabled?: boolean;
  freeShippingThreshold: number;
  returnPackageFee?: number;
  tradeLegFee?: number;
  effectiveFrom?: Date | string;
  packageTiers?: ShippingPackageTierInput[];
}

/** Kademe satırının yazılabilir alanları (create/update tek kaynak). */
function tierCreateData(tier: ShippingPackageTierInput) {
  return {
    code: tier.code,
    label: tier.label.trim(),
    minDesi: tier.minDesi,
    maxDesi: tier.maxDesi,
    amount: tier.amount,
    sampleWidth: tier.sampleWidth ?? null,
    sampleHeight: tier.sampleHeight ?? null,
    sampleLength: tier.sampleLength ?? null,
    sortOrder: SHIPPING_PACKAGE_TIER_ORDER.indexOf(tier.code),
  };
}

/**
 * ShippingTariffService — the SINGLE owner of shipping-tariff persistence + the
 * active-tariff read. Lives in its own leaf module (Prisma-only) so both the
 * checkout pricing path and the admin surface can depend on it without module cycles.
 * Audit logging is layered on top by the admin service (this stays audit-free domain).
 */
@Injectable()
export class ShippingTariffService {
  private readonly logger = new Logger(ShippingTariffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The active tariff for a provider. This deliberately reads the database on every
   * pricing request: a process-local cache is not invalidated in sibling API instances
   * and can keep charging an archived tariff after an admin activation.
   */
  async getActiveTariff(
    provider = DEFAULT_PROVIDER,
  ): Promise<ShippingTariffWithRates> {
    const tariff = await this.prisma.shippingTariff.findFirst({
      where: { provider, status: ShippingTariffStatus.active },
      include: TARIFF_INCLUDE,
    });
    if (!tariff) {
      throw new NotFoundException(
        i18nMessage("server.shipping.noActiveTariff", { provider }),
      );
    }
    return tariff;
  }

  /**
   * Pricing must never silently fall back to a hard-coded amount. Without an active
   * tariff there is no auditable version to snapshot, so checkout fails closed.
   */
  async getActiveOutboundTariff(
    provider = DEFAULT_PROVIDER,
  ): Promise<ShippingTariffWithRates> {
    try {
      return await this.getActiveTariff(provider);
    } catch (error) {
      this.logger.error(
        `No active ${provider} shipping tariff; checkout pricing is unavailable.`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.shipping.noActiveTariff", { provider }),
        { cause: error },
      );
    }
  }

  /**
   * Active-tariff snapshot metadata for order-create: the tariff id + version to
   * stamp onto the OrderPackage. The tariff object and metadata come from the same
   * row so amount calculation cannot be paired with a different active version.
   */
  async getActiveTariffSnapshot(provider = DEFAULT_PROVIDER): Promise<{
    tariffId: string;
    tariffVersion: number;
    tariff: ShippingTariffWithRates;
  }> {
    const tariff = await this.getActiveOutboundTariff(provider);
    return {
      tariffId: tariff.id,
      tariffVersion: tariff.version,
      tariff,
    };
  }

  /**
   * Estimated return-leg shipping cost from the active exact desi tariff.
   */
  async quoteReturnShipment(
    provider = DEFAULT_PROVIDER,
    billableDesi = 1,
  ): Promise<number> {
    const tariff = await this.getActiveOutboundTariff(provider);
    return shippingAmountForDesi(tariff, billableDesi).toNumber();
  }

  /**
   * Estimated TRADE-leg shipping cost from the active tariff (Phase 2). Consumed by
   * trade flows; falls back to the outbound fee if no trade fee is configured.
   */
  async quoteTradeShipment(provider = DEFAULT_PROVIDER): Promise<number> {
    const tariff = await this.getActiveOutboundTariff(provider);
    const fee = Number(tariff.tradeLegFee);
    return fee > 0 ? fee : Number(tariff.outboundPackageFee);
  }

  async list(provider?: string): Promise<ShippingTariffWithRates[]> {
    return this.prisma.shippingTariff.findMany({
      where: provider ? { provider } : undefined,
      orderBy: [{ provider: "asc" }, { version: "desc" }],
      include: TARIFF_INCLUDE,
    });
  }

  async getById(id: string): Promise<ShippingTariffWithRates> {
    const tariff = await this.prisma.shippingTariff.findUnique({
      where: { id },
      include: TARIFF_INCLUDE,
    });
    if (!tariff) {
      throw new NotFoundException(
        i18nMessage("server.shipping.tariffNotFound"),
      );
    }
    return tariff;
  }

  /** Create a DRAFT tariff; version auto-assigned as (max for provider) + 1. */
  async create(
    input: ShippingTariffInput,
    adminId: string,
  ): Promise<ShippingTariffWithRates> {
    const provider = input.provider ?? DEFAULT_PROVIDER;
    this.assertAmounts(input);
    this.assertPackageTiers(input.packageTiers);
    const last = await this.prisma.shippingTariff.findFirst({
      where: { provider },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    return this.prisma.shippingTariff.create({
      data: {
        provider,
        name: input.name,
        status: ShippingTariffStatus.draft,
        version,
        outboundPackageFee: input.outboundPackageFee,
        freeShippingEnabled: input.freeShippingEnabled ?? true,
        freeShippingThreshold: input.freeShippingThreshold,
        returnPackageFee: input.returnPackageFee ?? 0,
        tradeLegFee: input.tradeLegFee ?? 0,
        effectiveFrom: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : new Date(),
        createdBy: adminId,
        updatedBy: adminId,
        packageTiers: input.packageTiers?.length
          ? { create: input.packageTiers.map(tierCreateData) }
          : undefined,
      },
      include: TARIFF_INCLUDE,
    });
  }

  /** Update editable fields. Only DRAFT tariffs are editable (active/archived are frozen). */
  async update(
    id: string,
    input: Partial<ShippingTariffInput>,
    adminId: string,
  ): Promise<ShippingTariffWithRates> {
    const tariff = await this.getById(id);
    if (tariff.status !== ShippingTariffStatus.draft) {
      throw new BadRequestException(
        i18nMessage("server.shipping.tariffNotEditable"),
      );
    }
    this.assertAmounts(input);
    this.assertPackageTiers(input.packageTiers);
    return this.prisma.$transaction(async (tx) => {
      await tx.shippingTariff.update({
        where: { id },
        data: {
          name: input.name,
          outboundPackageFee: input.outboundPackageFee,
          freeShippingEnabled: input.freeShippingEnabled,
          freeShippingThreshold: input.freeShippingThreshold,
          returnPackageFee: input.returnPackageFee,
          tradeLegFee: input.tradeLegFee,
          effectiveFrom: input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : undefined,
          updatedBy: adminId,
        },
      });
      if (input.packageTiers !== undefined) {
        await tx.shippingPackageTier.deleteMany({ where: { tariffId: id } });
        if (input.packageTiers.length) {
          await tx.shippingPackageTier.createMany({
            data: input.packageTiers.map((tier) => ({
              tariffId: id,
              ...tierCreateData(tier),
            })),
          });
        }
      }
      return tx.shippingTariff.findUniqueOrThrow({
        where: { id },
        include: TARIFF_INCLUDE,
      });
    });
  }

  /**
   * Aktif tarifeyi kademeleriyle yeni bir DRAFT'a kopyalar.
   *
   * Aktif tarife dokunulmazdır (fiyat değişimi yeni sürüm doğurur ve sipariş o
   * sürümü snapshot'lar), ama bu kural olmadan admin her fiyat güncellemesinde üç
   * kademeyi, aralıkları ve örnek ölçüleri sıfırdan girmek zorunda kalıyor. Klon
   * bunu "düzenle" deneyimine çevirir: kopyala → tutarı değiştir → aktifleştir.
   */
  async cloneActive(
    adminId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<ShippingTariffWithRates> {
    const source = await this.getActiveTariff(provider);
    return this.create(
      {
        provider,
        name: `${source.name} (kopya)`,
        outboundPackageFee: Number(source.outboundPackageFee),
        freeShippingEnabled: source.freeShippingEnabled,
        freeShippingThreshold: Number(source.freeShippingThreshold),
        returnPackageFee: Number(source.returnPackageFee),
        tradeLegFee: Number(source.tradeLegFee),
        packageTiers: source.packageTiers.map((tier) => ({
          code: tier.code,
          label: tier.label,
          minDesi: tier.minDesi,
          maxDesi: tier.maxDesi,
          amount: Number(tier.amount),
          sampleWidth: tier.sampleWidth,
          sampleHeight: tier.sampleHeight,
          sampleLength: tier.sampleLength,
        })),
      },
      adminId,
    );
  }

  /**
   * Activate a DRAFT tariff atomically: archive the provider's current active tariff
   * and promote this one, in a single transaction (the partial-unique DB index also
   * guards single-active). Invalidates the active-tariff cache immediately.
   */
  async activate(
    id: string,
    adminId: string,
  ): Promise<ShippingTariffWithRates> {
    const tariff = await this.getById(id);
    if (tariff.status === ShippingTariffStatus.archived) {
      throw new BadRequestException(
        i18nMessage("server.shipping.tariffArchived"),
      );
    }
    if (tariff.status === ShippingTariffStatus.active) return tariff;
    this.assertActivatableTiers(tariff.packageTiers);

    const activated = await this.prisma.$transaction(async (tx) => {
      // Archive current active FIRST so the partial-unique(active) index is satisfied.
      await tx.shippingTariff.updateMany({
        where: {
          provider: tariff.provider,
          status: ShippingTariffStatus.active,
        },
        data: { status: ShippingTariffStatus.archived, updatedBy: adminId },
      });
      return tx.shippingTariff.update({
        where: { id },
        data: {
          status: ShippingTariffStatus.active,
          effectiveFrom: new Date(),
          updatedBy: adminId,
        },
        include: TARIFF_INCLUDE,
      });
    });
    this.logger.log(
      `Shipping tariff ${id} (v${tariff.version}, ${tariff.provider}) activated by ${adminId}`,
    );
    return activated;
  }

  /** Compute outbound shipping for sample seller-package subtotals under a given tariff. */
  async preview(
    id: string,
    subtotals: number[],
  ): Promise<{
    tariffId: string;
    version: number;
    packages: Array<{ subtotal: number; fullShipping: number; free: boolean }>;
  }> {
    const tariff = await this.getById(id);
    const packages = (subtotals.length ? subtotals : [0, 300, 600]).map(
      (subtotal) => {
        const full = outboundPackageShipping(tariff, subtotal);
        return {
          subtotal,
          fullShipping: full.toNumber(),
          free: full.isZero(),
        };
      },
    );
    return { tariffId: tariff.id, version: tariff.version, packages };
  }

  private assertAmounts(input: Partial<ShippingTariffInput>): void {
    const negative = [
      input.outboundPackageFee,
      input.freeShippingThreshold,
      input.returnPackageFee,
      input.tradeLegFee,
    ].some((v) => v != null && Number(v) < 0);
    if (negative) {
      throw new BadRequestException(
        i18nMessage("server.shipping.tariffNegativeAmount"),
      );
    }
  }

  /** Draft'a yazılabilir kademe şekli (aralık kapsaması aktifleştirmede denetlenir). */
  private assertPackageTiers(
    tiers: ShippingPackageTierInput[] | undefined,
  ): void {
    if (tiers === undefined) return;
    const codes = new Set<ShippingPackageTierCode>();
    for (const tier of tiers) {
      const invalid =
        !Number.isInteger(tier.minDesi) ||
        tier.minDesi < 0 ||
        (tier.maxDesi != null &&
          (!Number.isInteger(tier.maxDesi) || tier.maxDesi <= tier.minDesi)) ||
        !Number.isFinite(tier.amount) ||
        tier.amount < 0 ||
        !tier.label?.trim() ||
        codes.has(tier.code);
      if (invalid) {
        throw new BadRequestException({
          code: "INVALID_SHIPPING_PACKAGE_TIER",
          message:
            "Paket boyutu aralıkları artan ve benzersiz, tutarlar sıfır veya pozitif olmalıdır.",
        });
      }
      codes.add(tier.code);
    }
  }

  /**
   * Aktifleştirme guard'ı — kademe sözleşmesinin son savunması. Kademesiz, eksik,
   * boşluklu, çakışan ya da son kademesi ÜST SINIRLI bir tarife aktifleşirse
   * checkout bazı desiler için fiyat çözemez ve fail-closed 503 verir; yani satış
   * durur. Bu yüzden aktifleşme anında TAM kapsama zorunludur.
   */
  private assertActivatableTiers(
    tiers: Array<{
      code: ShippingPackageTierCode;
      minDesi: number;
      maxDesi: number | null;
      amount: Prisma.Decimal | number;
    }>,
  ): void {
    const expected = SHIPPING_PACKAGE_TIER_ORDER;
    const present = new Set(tiers.map((tier) => tier.code));
    if (
      tiers.length !== expected.length ||
      expected.some((code) => !present.has(code))
    ) {
      throw new BadRequestException({
        code: "SHIPPING_PACKAGE_TIERS_REQUIRED",
        message:
          "Tarife aktifleştirilmeden önce üç paket boyutunun (küçük, orta, büyük) tamamı tanımlanmalıdır.",
      });
    }

    const ordered = expected.map((code) =>
      tiers.find((tier) => tier.code === code)!,
    );
    // İlk kademe 0'dan başlar, her kademe öncekinin bittiği yerden devam eder
    // (boşluk/çakışma yok), son kademe üst sınırsızdır → her desi fiyatlanır.
    const invalidRanges =
      ordered[0].minDesi !== 0 ||
      ordered[ordered.length - 1].maxDesi != null ||
      ordered.some(
        (tier, index) =>
          Number(tier.amount) < 0 ||
          (index < ordered.length - 1 &&
            (tier.maxDesi == null ||
              tier.maxDesi <= tier.minDesi ||
              ordered[index + 1].minDesi !== tier.maxDesi)),
      );
    if (invalidRanges) {
      throw new BadRequestException({
        code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID",
        message:
          "Paket boyutu aralıkları 0'dan başlamalı, boşluksuz ve çakışmasız ilerlemeli, son boyut üst sınırsız olmalıdır.",
      });
    }
  }
}
