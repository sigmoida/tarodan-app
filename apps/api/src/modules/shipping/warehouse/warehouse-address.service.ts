import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { platformWarehouseAddress } from "../../../config/warehouse";

/**
 * The platform warehouse address — one resolver for every caller that needs it.
 *
 * The warehouse used to exist twice by two different mechanisms. Inbound trade
 * legs and refund returns wrote it out as text from `config/warehouse.ts` (env,
 * with non-null defaults); outbound and return shipments looked up an `Address`
 * row from the `warehouse_address_id` platform setting — but only ever as
 * `select: { id: true }`, to stamp `TradeShipment.fromAddressId`. Nothing read
 * that row's fields, so the divergence stayed invisible: moving the warehouse in
 * admin Settings left the env copy stale while the health check stayed green.
 *
 * Carrier payloads now carry the sender as well as the recipient, so both copies
 * would go on the wire — the same warehouse, spelled two ways, on the two legs
 * of a single trade. The row wins, because it is the one an admin can edit and
 * the one the health check verifies. The env text survives as a last-resort
 * fallback so an unset setting cannot block a trade or a return.
 *
 * Two entry points, deliberately different about failure:
 * - `resolve()` is for carrier payloads and never throws — it falls through to
 *   the env text, because refusing to open a parcel over a missing setting is
 *   worse than shipping to the configured default.
 * - `resolveId()` is for the `fromAddressId` column, which needs a real row, so
 *   it throws when there is none. That is the pre-existing behaviour of
 *   `AdminTradeCommonService.resolveWarehouseAddressId`, kept intact.
 */

/** Warehouse address fields, plus the row id when a real row supplied them. */
export interface ResolvedWarehouseAddress {
  /** Address row id, or `null` when the env fallback supplied the values. */
  id: string | null;
  fullName: string;
  address: string;
  city: string;
  district: string;
  phone: string;
}

const WAREHOUSE_ADDRESS_SETTING_KEY = "warehouse_address_id";

type WarehouseAddressRow = {
  id: string;
  fullName: string;
  address: string;
  city: string;
  district: string;
  phone: string;
};

@Injectable()
export class WarehouseAddressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The warehouse address for a carrier payload. Never throws: falls back to the
   * env text (`config/warehouse.ts`, itself non-null by design) when no row is
   * configured, so a missing setting degrades to the documented default instead
   * of blocking a shipment.
   */
  async resolve(
    tx?: Prisma.TransactionClient,
  ): Promise<ResolvedWarehouseAddress> {
    const row = await this.findRow(tx ?? this.prisma);
    if (row) return row;
    return { id: null, ...platformWarehouseAddress() };
  }

  /**
   * The warehouse `Address` row id, for callers writing `fromAddressId`. Throws
   * when none can be determined — a foreign key cannot take the env fallback.
   */
  async resolveId(tx: Prisma.TransactionClient): Promise<string> {
    const row = await this.findRow(tx);
    if (row) return row.id;
    throw new BadRequestException(
      i18nMessage("server.admin.warehouseAddressMissing"),
    );
  }

  /**
   * The configured warehouse row: the `warehouse_address_id` setting first, then
   * any active admin's first address. Both steps predate this service and are
   * kept in the same order so behaviour is unchanged.
   */
  private async findRow(
    db: Prisma.TransactionClient,
  ): Promise<WarehouseAddressRow | null> {
    const select = {
      id: true,
      fullName: true,
      address: true,
      city: true,
      district: true,
      phone: true,
    } as const;

    const setting = await db.platformSetting.findUnique({
      where: { settingKey: WAREHOUSE_ADDRESS_SETTING_KEY },
    });
    if (setting?.settingValue) {
      const configured = await db.address.findUnique({
        where: { id: setting.settingValue },
        select,
      });
      if (configured) return configured;
    }

    const admin = await db.adminUser.findFirst({
      where: { isActive: true },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    });
    if (admin) {
      const fallback = await db.address.findFirst({
        where: { userId: admin.userId },
        select,
      });
      if (fallback) return fallback;
    }

    return null;
  }
}
