import { Injectable, Logger } from "@nestjs/common";
import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import { errorMessage } from "../../../common/helpers/error-message";
import { AdminAuditService } from "../ops/admin-audit.service";
import { ProductRenewalService } from "../../product/lifecycle/product-renewal.service";
import { describeRenewalFailure } from "../../product/helpers/product-renewal";

export const ADMIN_RENEW_AUDIT_ACTION = "product.renew_expired";

export type AdminRenewalItemResult =
  | { id: string; ok: true }
  | {
      id: string;
      ok: false;
      errorKey: string;
      errorParams?: Record<string, unknown>;
    };

export interface AdminRenewalBatchResult {
  results: AdminRenewalItemResult[];
  renewed: number;
  failed: number;
}

/**
 * Yönetici: süresi dolmuş ilanı yeniden yayına alır. Yazım ve tüm kapılar
 * (stok, üyelik limiti, komisyon, satıcı durumu, "yalnız süresi dolmuş")
 * alan servisinde (`ProductRenewalService.reactivateByAdmin`) durur; burası
 * yalnız denetim kaydını ve toplu sonuç şeklini ekler.
 */
@Injectable()
export class AdminProductRenewalService {
  private readonly logger = new Logger(AdminProductRenewalService.name);

  constructor(
    private readonly renewal: ProductRenewalService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Tek ilan. Hata semantik (yerelleştirilmiş) istisna olarak yayılır. */
  async renew(
    adminId: string,
    productId: string,
  ): Promise<{ id: string; status: typeof ProductStatus.active }> {
    await this.renewal.reactivateByAdmin(productId);
    await this.audit.createAuditLog(
      adminId,
      ADMIN_RENEW_AUDIT_ACTION,
      "Product",
      productId,
      {
        status: ProductStatus.inactive,
        inactiveReason: ProductInactiveReason.expired,
      },
      { status: ProductStatus.active },
    );
    return { id: productId, status: ProductStatus.active };
  }

  /**
   * Toplu: SIRALI (üyelik ilan limiti her ilandan önce güncel sayıdan okunur),
   * her ilan kendi sonucuyla döner; biri düşerse diğerleri etkilenmez.
   */
  async renewMany(
    adminId: string,
    productIds: readonly string[],
  ): Promise<AdminRenewalBatchResult> {
    const results: AdminRenewalItemResult[] = [];
    for (const id of [...new Set(productIds)]) {
      try {
        await this.renew(adminId, id);
        results.push({ id, ok: true });
      } catch (error) {
        const failure = describeRenewalFailure(error);
        if (failure.unexpected) {
          this.logger.error(
            `admin renew failed for ${id}: ${errorMessage(error)}`,
          );
        }
        results.push({
          id,
          ok: false,
          errorKey: failure.errorKey,
          ...(failure.errorParams ? { errorParams: failure.errorParams } : {}),
        });
      }
    }
    const renewed = results.filter((r) => r.ok).length;
    return { results, renewed, failed: results.length - renewed };
  }
}
