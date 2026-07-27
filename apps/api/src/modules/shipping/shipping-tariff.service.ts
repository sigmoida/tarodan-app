import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, ShippingTariff, ShippingTariffStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { outboundPackageShipping } from "./shipping-tariff.helper";

const DEFAULT_PROVIDER = "surat";
const ACTIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export interface ShippingTariffInput {
  provider?: string;
  name: string;
  outboundPackageFee: number;
  freeShippingEnabled?: boolean;
  freeShippingThreshold: number;
  returnPackageFee?: number;
  tradeLegFee?: number;
  effectiveFrom?: Date | string;
}

/**
 * ShippingTariffService — the SINGLE owner of shipping-tariff persistence + the
 * cached active-tariff read. Lives in its own leaf module (Prisma-only) so both the
 * checkout pricing path and the admin surface can depend on it without module cycles.
 * Audit logging is layered on top by the admin service (this stays audit-free domain).
 */
@Injectable()
export class ShippingTariffService {
  private readonly logger = new Logger(ShippingTariffService.name);
  private activeCache = new Map<
    string,
    { tariff: ShippingTariff; at: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** The active tariff for a provider (cached ~5 min). Throws if none is active. */
  async getActiveTariff(provider = DEFAULT_PROVIDER): Promise<ShippingTariff> {
    const cached = this.activeCache.get(provider);
    if (cached && Date.now() - cached.at < ACTIVE_CACHE_TTL_MS) {
      return cached.tariff;
    }
    const tariff = await this.prisma.shippingTariff.findFirst({
      where: { provider, status: ShippingTariffStatus.active },
    });
    if (!tariff) {
      throw new NotFoundException(
        i18nMessage("server.shipping.noActiveTariff", { provider }),
      );
    }
    this.activeCache.set(provider, { tariff, at: Date.now() });
    return tariff;
  }

  /** Drop the cached active tariff (call after any activation). */
  invalidateActiveCache(provider?: string): void {
    if (provider) this.activeCache.delete(provider);
    else this.activeCache.clear();
  }

  async list(provider?: string): Promise<ShippingTariff[]> {
    return this.prisma.shippingTariff.findMany({
      where: provider ? { provider } : undefined,
      orderBy: [{ provider: "asc" }, { version: "desc" }],
    });
  }

  async getById(id: string): Promise<ShippingTariff> {
    const tariff = await this.prisma.shippingTariff.findUnique({
      where: { id },
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
  ): Promise<ShippingTariff> {
    const provider = input.provider ?? DEFAULT_PROVIDER;
    this.assertAmounts(input);
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
      },
    });
  }

  /** Update editable fields. Only DRAFT tariffs are editable (active/archived are frozen). */
  async update(
    id: string,
    input: Partial<ShippingTariffInput>,
    adminId: string,
  ): Promise<ShippingTariff> {
    const tariff = await this.getById(id);
    if (tariff.status !== ShippingTariffStatus.draft) {
      throw new BadRequestException(
        i18nMessage("server.shipping.tariffNotEditable"),
      );
    }
    this.assertAmounts(input);
    return this.prisma.shippingTariff.update({
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
  }

  /**
   * Activate a DRAFT tariff atomically: archive the provider's current active tariff
   * and promote this one, in a single transaction (the partial-unique DB index also
   * guards single-active). Invalidates the active-tariff cache immediately.
   */
  async activate(id: string, adminId: string): Promise<ShippingTariff> {
    const tariff = await this.getById(id);
    if (tariff.status === ShippingTariffStatus.archived) {
      throw new BadRequestException(
        i18nMessage("server.shipping.tariffArchived"),
      );
    }
    if (tariff.status === ShippingTariffStatus.active) return tariff;

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
      });
    });
    this.invalidateActiveCache(tariff.provider);
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
}
