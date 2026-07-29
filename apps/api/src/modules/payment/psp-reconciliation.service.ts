import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import type { PayTRStatusInquirySuccess } from "../payment-providers/paytr.service";
import { PaymentProviderEventService } from "./payment-provider-event.service";
import { PaymentStatus, OrderStatus } from "@prisma/client";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

/**
 * PSP (PayTR) durum-sorgu tabanlı mutabakat süpürmeleri (cron). Callback kaçırılmış
 * ödemeleri telafi eder ve orphan capture'ları yakalar. PaymentReconciliationService
 * facade'i aynı imzalarla buraya delege eder.
 */
@Injectable()
export class PspReconciliationService {
  private readonly logger = new Logger(PspReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    // Gözlemlenebilirlik (best-effort). @Optional: durum-sorgu ile telafi eden
    // testler bu recorder'ı sağlamak zorunda kalmasın — record() zaten hiç fırlatmaz.
    @Optional()
    private readonly providerEvents?: PaymentProviderEventService,
  ) {}

  /**
   * PayTR callback sunucuya ulaşmadan ödeme başarılı olduysa: durum-sorgu ile doğrula ve tamamla (1.4).
   * PAYTR_RECONCILIATION_ENABLED=false ile kapatılabilir.
   */
  async reconcilePendingPaytrPayments(): Promise<{
    checked: number;
    completed: number;
  }> {
    const enabled = this.configService.get("PAYTR_RECONCILIATION_ENABLED");
    if (enabled === "false" || enabled === "0") {
      return { checked: 0, completed: 0 };
    }

    const minAgeMin = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_MIN_AGE_MINUTES") || "3",
      10,
    );
    const batch = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_BATCH_LIMIT") || "40",
      10,
    );
    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );

    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minAgeMin);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: "paytr",
        status: PaymentStatus.pending,
        providerConversationId: { not: null },
        OR: [
          { order: { status: OrderStatus.pending_payment } },
          // Grup ödemesi: gruptaki en az bir sipariş hâlâ ödeme bekliyorsa
          {
            checkoutGroup: {
              orders: { some: { status: OrderStatus.pending_payment } },
            },
          },
        ],
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
      },
      take: batch,
      orderBy: { createdAt: "asc" },
    });

    let checked = 0;
    let completed = 0;

    for (const row of candidates) {
      checked++;
      const ourAmount = Number(row.amount);
      try {
        // FLOW-M3: TÜM oid'leri tara (güncel providerConversationId + merchantOidHistory).
        // Capture rotate edilmiş ESKİ bir oid'de olmuş olabilir; yalnız güncel oid'i
        // sormak sahipsiz capture'ı kaçırırdı. İlk çekilmiş + tutar-tutan oid capture'dır.
        const oids = this.paymentCommon.collectPaymentOids(row);
        let capturedOid: string | null = null;
        let capturedInquiry: PayTRStatusInquirySuccess | null = null;
        for (const candidateOid of oids) {
          const inquiry = await this.paymentProviders
            .resolve()
            .queryPaymentStatus(candidateOid);
          if (!inquiry.ok) continue;
          if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
            // O10: tutar uyuşmazlığı → ALARM (yüksek öncelik), completed YAPMA.
            this.logger.error(
              `ALARM: PayTR reconcile tutar uyuşmazlığı — payment=${row.id} oid=${candidateOid} ` +
                `paytr=${inquiry.paymentTotalTl} ours=${ourAmount}. Ödeme tamamlanmadı, manuel inceleme gerekir.`,
            );
            continue;
          }
          capturedOid = candidateOid;
          capturedInquiry = inquiry;
          break;
        }
        if (!capturedOid || !capturedInquiry) {
          continue;
        }

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });

        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : (full?.checkoutGroup?.orders.some(
              (o) => o.status === OrderStatus.pending_payment,
            ) ?? false);

        if (
          !full ||
          full.status !== PaymentStatus.pending ||
          !orderStillPayable
        ) {
          continue;
        }

        const txnRef =
          capturedInquiry.paymentDate != null &&
          capturedInquiry.paymentDate !== ""
            ? `paytr:${capturedOid}:${capturedInquiry.paymentDate}`
            : `paytr:${capturedOid}`;

        const did = await this.paymentFulfillment.processSuccessfulPayment(
          full,
          txnRef,
          capturedOid, // FLOW-M5: çekilen oid'i providerConversationId'ye senkronla
        );
        if (did) {
          completed++;
          this.logger.log(
            `PayTR reconcile completed payment ${row.id} oid=${capturedOid}`,
          );
        }
        // Gözlemlenebilirlik: callback kaçırılmış ama durum-sorgu ile TELAFİ edilmiş
        // ödeme. Yalnız BULUNAN (ok) sorgular kaydedilir — başarısız pollingler değil.
        await this.providerEvents?.record({
          eventType: "status_inquiry",
          merchantOid: capturedOid,
          paymentId: row.id,
          status: "success",
          paymentType: capturedInquiry.paymentType ?? null,
          installmentCount: capturedInquiry.installmentCount ?? null,
          currency: capturedInquiry.currency ?? null,
          amount: ourAmount,
          totalAmount: capturedInquiry.paymentTotalTl,
          raw: {
            source: "reconcile",
            completed: did,
            paymentDate: capturedInquiry.paymentDate ?? null,
          },
        });
      } catch (error: any) {
        this.logger.error(
          `PayTR reconcile failed payment ${row.id}: ${error?.message}`,
        );
      }
    }

    return { checked, completed };
  }

  /**
   * FLOW-M3 (2.1): `failed` işaretli ama PayTR'da GERÇEKTEN çekilmiş ödemeleri (orphan
   * capture) yakalar. Bir ödeme 3DS/callback yarışında `failed` olabilir ama para çekilmiş
   * olabilir → sipariş fulfil edilmez, iade edilmez, para havada kalır. TÜM oid'leri tarar;
   * capture bulursa:
   *  - sipariş hâlâ ödenebilir (pending_payment) → CAS ile failed→pending resetleyip TAMAMLA (telafi),
   *  - değilse (iptal/gitmiş) → yüksek-öncelik ALARM (ORPHAN_CAPTURE_REVIEW). Sipariş fulfil
   *    edilemeyen capture'ın OTO-İADESİ bilerek Faz 4'e bırakıldı (cron-tetikli para iadesi riski).
   * Cache dedup: aynı failed ödemeyi her turda PayTR'ye sormamak için 6s. Trade-cash orphan'ı
   * ayrı ele alınır (bu tarama order/grup ile sınırlı).
   */
  async detectOrphanCapturedFailedPayments(): Promise<{
    checked: number;
    recovered: number;
    alarms: number;
  }> {
    const enabled = this.configService.get("PAYTR_RECONCILIATION_ENABLED");
    if (enabled === "false" || enabled === "0") {
      return { checked: 0, recovered: 0, alarms: 0 };
    }
    const lookbackH = parseInt(
      this.configService.get("PAYTR_ORPHAN_LOOKBACK_HOURS") || "72",
      10,
    );
    const batch = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_BATCH_LIMIT") || "40",
      10,
    );
    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );
    const since = new Date();
    since.setHours(since.getHours() - lookbackH);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: "paytr",
        status: PaymentStatus.failed,
        providerConversationId: { not: null },
        updatedAt: { gt: since },
        OR: [{ orderId: { not: null } }, { checkoutGroupId: { not: null } }],
      },
      take: batch,
      orderBy: { updatedAt: "desc" },
    });

    let checked = 0;
    let recovered = 0;
    let alarms = 0;
    for (const row of candidates) {
      const dedupKey = `orphan-checked:${row.id}`;
      if (await this.cache.get<boolean>(dedupKey)) continue;
      checked++;
      const ourAmount = Number(row.amount);
      try {
        const oids = this.paymentCommon.collectPaymentOids(row);
        let capturedOid: string | null = null;
        let capturedInquiry: PayTRStatusInquirySuccess | null = null;
        for (const oid of oids) {
          const inquiry = await this.paymentProviders
            .resolve()
            .queryPaymentStatus(oid);
          if (!inquiry.ok) continue;
          if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance)
            continue;
          capturedOid = oid;
          capturedInquiry = inquiry;
          break;
        }
        // Her sonuçta dedup yaz (captured değilse 6s tekrar sorma; captured+alarm ise
        // 6s'de bir tekrar-alarm makul; captured+telafi ise satır completed olur zaten).
        await this.cache.set(dedupKey, true, { ttl: 6 * 60 * 60 });

        if (!capturedOid || !capturedInquiry) continue;

        // Gözlemlenebilirlik: `failed` işaretli ama PayTR'da GERÇEKTEN çekilmiş ödeme
        // (orphan capture) durum-sorgu ile tespit edildi — telafi/alarm ayrı loglanır.
        await this.providerEvents?.record({
          eventType: "status_inquiry",
          merchantOid: capturedOid,
          paymentId: row.id,
          status: "success",
          paymentType: capturedInquiry.paymentType ?? null,
          installmentCount: capturedInquiry.installmentCount ?? null,
          currency: capturedInquiry.currency ?? null,
          amount: ourAmount,
          totalAmount: capturedInquiry.paymentTotalTl,
          raw: {
            source: "orphan_detect",
            paymentDate: capturedInquiry.paymentDate ?? null,
          },
        });

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });
        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : (full?.checkoutGroup?.orders.some(
              (o) => o.status === OrderStatus.pending_payment,
            ) ?? false);

        if (orderStillPayable) {
          // TELAFİ: CAS ile failed→pending resetle, sonra tamamla (capture doğrulandı).
          const reset = await this.prisma.payment.updateMany({
            where: { id: row.id, status: PaymentStatus.failed },
            data: { status: PaymentStatus.pending },
          });
          if (reset.count === 0) continue; // arada değişti
          const fresh = await this.prisma.payment.findUnique({
            where: { id: row.id },
            include: {
              order: { include: { buyer: true, seller: true, product: true } },
              checkoutGroup: {
                include: { orders: { select: { status: true } } },
              },
              tradeCashPayment: true,
            },
          });
          const txnRef =
            capturedInquiry.paymentDate != null &&
            capturedInquiry.paymentDate !== ""
              ? `paytr:${capturedOid}:${capturedInquiry.paymentDate}`
              : `paytr:${capturedOid}`;
          const did = await this.paymentFulfillment.processSuccessfulPayment(
            fresh,
            txnRef,
            capturedOid,
          );
          if (did) {
            recovered++;
            this.logger.warn(
              `ORPHAN_CAPTURE_RECOVERED: failed işaretli ama PayTR'da çekilmiş ödeme telafi edildi ` +
                `payment=${row.id} oid=${capturedOid}`,
            );
          }
        } else {
          // Sipariş gitmiş → fulfil edilemez. Oto-iade RİSKLİ (Faz 4). Yüksek öncelik ALARM.
          alarms++;
          this.logger.error(
            `ORPHAN_CAPTURE_REVIEW: PayTR'da ÇEKİLMİŞ ama sipariş fulfil EDİLEMEZ (iptal/gitmiş) — ` +
              `payment=${row.id} oid=${capturedOid} tutar=${ourAmount}. MANUEL İADE gerekir.`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `detectOrphanCapturedFailedPayments payment ${row.id}: ${error?.message}`,
        );
      }
    }
    if (recovered > 0 || alarms > 0) {
      this.logger.warn(
        `Orphan capture taraması: ${recovered} telafi, ${alarms} manuel-inceleme (checked=${checked})`,
      );
    }
    return { checked, recovered, alarms };
  }
}
