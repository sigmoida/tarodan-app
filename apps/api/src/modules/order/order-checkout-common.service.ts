import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { TaxService } from "../tax/tax.service";
import { CommissionResult } from "./order-pricing.service";

/**
 * Sipariş oluşturma primitifleri (Sürat gönderi fail-fast, kurumsal-satıcı KDV,
 * benzersiz sipariş no, komisyon anlık görüntüsü, Sürat idempotency anahtarı) —
 * OrderCheckoutService'ten birebir taşındı. Direct/group/guest alt servisleri
 * buraya delege eder (product-common.service.ts'teki paylaşılan Common deseniyle
 * aynı). Leaf: prisma, suratCargoService, taxService (döngü yok).
 */
@Injectable()
export class OrderCheckoutCommonService {
  private readonly logger = new Logger(OrderCheckoutCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suratCargoService: SuratCargoService,
    private readonly taxService: TaxService,
  ) {}

  buildSuratIdempotencyKey(parts: string[]): string {
    return createHash("sha256")
      .update(parts.filter((p) => p.length > 0).join("|"))
      .digest("hex");
  }

  /** E-ticaret stopaj oranı (%) — PlatformSetting 'withholding_tax_rate', varsayılan %1 (9284 sayılı CK). */
  private async getWithholdingTaxRate(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "withholding_tax_rate" },
    });
    const rate = Number(row?.settingValue ?? "1");
    return Number.isFinite(rate) && rate >= 0 ? rate : 1;
  }

  /**
   * KDV + stopaj: yalnızca kurumsal satıcıda (businessStatus=approved + taxId dolu).
   * KDV ürün fiyatına eklenir (alıcı öder); stopaj (GVK 94/19) KDV hariç ürün bedeli
   * üzerinden hesaplanır ve satıcı payout'undan kesilir. Bireysel satıcı ikisinde de
   * kapsam dışıdır (stopaj: 330 Seri No'lu GV Genel Tebliği — mükellef olmayana tevkifat yok).
   * Matrah kargo ve alıcı hizmet bedelini içermez (komisyonla aynı baz).
   */
  async resolveSellerTaxes(
    sellerId: string,
    categoryId: string | null,
    subtotal: number,
  ): Promise<{ taxAmount: number; withholdingTaxAmount: number }> {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { businessStatus: true, taxId: true },
    });
    if (seller?.businessStatus !== "approved" || !seller?.taxId) {
      return { taxAmount: 0, withholdingTaxAmount: 0 };
    }
    const resolved = await this.taxService.resolveTaxRate(
      "TR",
      null,
      categoryId,
    );
    const taxAmount = resolved
      ? this.taxService.calculateTaxAmount(subtotal, resolved)
      : 0;
    const withholdingRate = await this.getWithholdingTaxRate();
    const withholdingTaxAmount =
      withholdingRate > 0 ? Math.round(subtotal * withholdingRate) / 100 : 0;
    return { taxAmount, withholdingTaxAmount };
  }

  /**
   * DEPRECATED / no-op. Sürat gönderisi artık ödeme ÖNCESİ ön-kayıt yerine, ödeme
   * onaylanınca (payment-fulfillment → PaymentCommonService.createSuratBarcodeForOrder)
   * `OrtakBarkodOlustur` ile GERÇEK kargo kodu döndürerek oluşturuluyor. Ödeme öncesi
   * fail-fast kaldırıldı: (1) aynı OzelKargoTakipNo ile çift kayıt olmasın, (2) Sürat
   * anlık hatası alıcının siparişini/checkout'unu düşürmesin (non-blocking). Adres
   * geçerliliği DTO doğrulamasıyla sağlanır. İmza uyumu için çağıranlar kalır.
   */
  async assertSuratShipmentSucceeded(_ctx: {
    correlationId: string;
    idempotencyKey: string;
    recipientFullName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddressLine: string;
    productId: string;
    productTitle?: string;
    orderNumberPreview: string;
  }): Promise<void> {
    return;
  }

  /**
   * Generate a non-guessable, unique order number (e.g. "ORD-K7X9M2QF3N").
   * Random by design so the value leaks no sequence/order-count information and
   * cannot be enumerated. The `order_number` column's @unique constraint is the
   * final guard against the (negligible) chance of a collision.
   */
  async generateOrderNumber(): Promise<string> {
    return generateUniqueReference(
      "ORD",
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
    );
  }

  /**
   * Record commission data to analytics snapshot
   * Requirement: Store commission snapshot (3.3)
   */
  async recordCommissionSnapshot(
    orderId: string,
    orderNumber: string,
    commissionAmount: number,
    totalAmount: number,
    result: CommissionResult,
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Try to update existing daily snapshot or create new one
      await this.prisma.analyticsSnapshot.upsert({
        where: {
          snapshotType_snapshotDate: {
            snapshotType: "daily_commission",
            snapshotDate: today,
          },
        },
        update: {
          totalRevenue: {
            increment: commissionAmount,
          },
          newOrders: {
            increment: 1,
          },
          data: {
            // Note: In production, you'd merge this with existing data
            lastOrderId: orderId,
            lastOrderNumber: orderNumber,
            lastCommission: commissionAmount,
            lastRuleId: result.ruleId,
            lastRuleName: result.ruleName,
            lastAppliedRate: result.appliedRate,
          },
        },
        create: {
          snapshotType: "daily_commission",
          snapshotDate: today,
          totalRevenue: commissionAmount,
          newOrders: 1,
          data: {
            orders: [
              {
                orderId,
                orderNumber,
                totalAmount,
                commissionAmount,
                ruleId: result.ruleId,
                ruleName: result.ruleName,
                appliedRate: result.appliedRate,
                wasMinApplied: result.wasMinApplied,
                wasMaxApplied: result.wasMaxApplied,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        },
      });

      this.logger.debug(
        `Commission snapshot recorded for order ${orderNumber}`,
      );
    } catch (error) {
      // Don't fail the order if snapshot fails
      this.logger.error(`Failed to record commission snapshot: ${error}`);
    }
  }
}
