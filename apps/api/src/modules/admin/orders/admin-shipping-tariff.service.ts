import { Injectable } from "@nestjs/common";
import { ShippingTariffService } from "../../shipping/tariff/shipping-tariff.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import {
  CreateShippingTariffDto,
  UpdateShippingTariffDto,
} from "../dto/shipping-tariff.dto";

/**
 * Admin-facing shipping-tariff orchestration: delegates persistence to the domain
 * ShippingTariffService and layers audit logging on the mutating operations. Keeps
 * the domain service audit-free (and cycle-free) while matching the admin convention
 * that mutations are audited in the service, not the controller.
 */
@Injectable()
export class AdminShippingTariffService {
  constructor(
    private readonly tariffs: ShippingTariffService,
    private readonly audit: AdminAuditService,
  ) {}

  list(provider?: string) {
    return this.tariffs.list(provider);
  }

  getById(id: string) {
    return this.tariffs.getById(id);
  }

  preview(id: string, subtotals?: number[]) {
    return this.tariffs.preview(id, subtotals ?? []);
  }

  async create(dto: CreateShippingTariffDto, adminId: string) {
    const created = await this.tariffs.create(dto, adminId);
    await this.audit.createAuditLog(
      adminId,
      "shipping_tariff_create",
      "ShippingTariff",
      created.id,
      null,
      created,
    );
    return created;
  }

  async update(id: string, dto: UpdateShippingTariffDto, adminId: string) {
    const before = await this.tariffs.getById(id);
    const updated = await this.tariffs.update(id, dto, adminId);
    await this.audit.createAuditLog(
      adminId,
      "shipping_tariff_update",
      "ShippingTariff",
      id,
      before,
      updated,
    );
    return updated;
  }

  /** Aktif tarifeyi kademeleriyle yeni bir draft'a kopyalar (fiyat güncelleme kısayolu). */
  async cloneActive(adminId: string, provider?: string) {
    const created = await this.tariffs.cloneActive(adminId, provider);
    await this.audit.createAuditLog(
      adminId,
      "shipping_tariff_clone",
      "ShippingTariff",
      created.id,
      null,
      created,
    );
    return created;
  }

  async activate(id: string, adminId: string) {
    const before = await this.tariffs.getById(id);
    const activated = await this.tariffs.activate(id, adminId);
    await this.audit.createAuditLog(
      adminId,
      "shipping_tariff_activate",
      "ShippingTariff",
      id,
      before,
      activated,
    );
    return activated;
  }
}
