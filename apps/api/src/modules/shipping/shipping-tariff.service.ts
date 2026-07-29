import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Prisma,
  ShippingTariff,
  ShippingTariffRate,
  ShippingTariffStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import {
  outboundPackageShipping,
  shippingAmountForDesi,
} from "./shipping-tariff.helper";

const DEFAULT_PROVIDER = "surat";
export type ShippingTariffWithRates = ShippingTariff & {
  rates: ShippingTariffRate[];
};

export interface ShippingTariffInput {
  provider?: string;
  name: string;
  outboundPackageFee: number;
  freeShippingEnabled?: boolean;
  freeShippingThreshold: number;
  returnPackageFee?: number;
  tradeLegFee?: number;
  effectiveFrom?: Date | string;
  rates?: Array<{ desi: number; amount: number }>;
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
      include: { rates: { orderBy: { desi: "asc" } } },
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
      include: { rates: { orderBy: { desi: "asc" } } },
    });
  }

  async getById(id: string): Promise<ShippingTariffWithRates> {
    const tariff = await this.prisma.shippingTariff.findUnique({
      where: { id },
      include: { rates: { orderBy: { desi: "asc" } } },
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
    this.assertRates(input.rates);
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
        rates: input.rates?.length
          ? {
              create: input.rates.map((rate) => ({
                desi: rate.desi,
                amount: rate.amount,
              })),
            }
          : undefined,
      },
      include: { rates: { orderBy: { desi: "asc" } } },
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
    this.assertRates(input.rates);
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
      if (input.rates !== undefined) {
        await tx.shippingTariffRate.deleteMany({ where: { tariffId: id } });
        if (input.rates.length) {
          await tx.shippingTariffRate.createMany({
            data: input.rates.map((rate) => ({
              tariffId: id,
              desi: rate.desi,
              amount: rate.amount,
            })),
          });
        }
      }
      return tx.shippingTariff.findUniqueOrThrow({
        where: { id },
        include: { rates: { orderBy: { desi: "asc" } } },
      });
    });
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
    if (!tariff.rates.length) {
      throw new BadRequestException({
        code: "SHIPPING_DESI_RATES_REQUIRED",
        message:
          "Desi tarifesi aktifleştirilmeden önce en az bir fiyat satırı girilmelidir.",
      });
    }
    if (!tariff.rates.some((rate) => rate.desi === 1)) {
      throw new BadRequestException({
        code: "SHIPPING_ONE_DESI_RATE_REQUIRED",
        message:
          "Mevcut ürünlerin varsayılan desisi için 1 desi fiyatı tanımlanmalıdır.",
      });
    }

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
        include: { rates: { orderBy: { desi: "asc" } } },
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

  private assertRates(
    rates: Array<{ desi: number; amount: number }> | undefined,
  ): void {
    if (rates === undefined) return;
    const desiValues = new Set<number>();
    for (const rate of rates) {
      if (
        !Number.isInteger(rate.desi) ||
        rate.desi < 1 ||
        !Number.isFinite(rate.amount) ||
        rate.amount < 0 ||
        desiValues.has(rate.desi)
      ) {
        throw new BadRequestException({
          code: "INVALID_SHIPPING_DESI_RATE",
          message:
            "Desi değerleri pozitif ve benzersiz, tutarlar sıfır veya pozitif olmalıdır.",
        });
      }
      desiValues.add(rate.desi);
    }
  }
}
