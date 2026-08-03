import {
  Injectable,
  Logger,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import {
  PayoutStatus,
  PaymentHoldStatus,
  PaymentStatus,
  OrderStatus,
  RefundRequestStatus,
  RefundAttemptStatus,
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
} from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { LedgerService } from "../ledger/ledger.service";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { isValidTrIban } from "../../common/validators/tr-iban";
import { generateUniqueReference } from "../../common/helpers/generate-reference";

/** IBAN'ı log-güvenli hale getir (KVKK): yalnız son 4 hane. */
function maskIban(iban: string | null | undefined): string {
  const clean = (iban || "").replace(/\s/g, "");
  return clean ? `***${clean.slice(-4)}` : "(yok)";
}

const PAYOUT_ELIGIBLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.awaiting_buyer_confirmation,
  OrderStatus.completed,
];

const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.pending_review,
  RefundRequestStatus.approved,
  RefundRequestStatus.wait_for_delivery,
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
  RefundRequestStatus.return_delivered,
  RefundRequestStatus.disputed,
];

const IBAN_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Aşama-1 kabulünden sonra transfer sonucu callback'inin makul bekleme süresi.
 * Banka EFT'si gün aşabilir; bu pencere aşılırsa alarm (otomatik aksiyon yok).
 */
const PAYOUT_CALLBACK_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;

/** Tutar eşiği: bu değerin altındaki net ödeme "sıfır" kabul edilir (kuruş artıkları). */
const PAYOUT_MIN_NET = 0.01;

/** Henüz sonuçlanmamış (parayı bağlayan) iade denemesi durumları. */
const UNRESOLVED_REFUND_ATTEMPT_STATUSES: RefundAttemptStatus[] = [
  RefundAttemptStatus.prepared,
  RefundAttemptStatus.submitting,
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.manual_review,
];

/**
 * Satıcının bir hold üzerinden hak ettiği GÜNCEL net tutar: escrow'a giren
 * tutar eksi o hold'dan iade edilmiş kısım. Payout oluşturma ve transfer
 * öncesi yeniden doğrulama AYNI bu formülü kullanır (tek kaynak) — aksi halde
 * kısmi iade sonrası satırda kalan bayat `netAmount` transfer edilebilir.
 */
function entitledNetFromHold(hold: {
  amount: unknown;
  refundedAmount?: unknown;
}): number {
  return Number(hold.amount) - Number(hold.refundedAmount ?? 0);
}

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    // Faz 6.2: payout tamamlanınca çift-taraflı defter kaydı (escrow settle).
    // @Optional + best-effort — defter hatası payout'u BOZMAZ; reconciliation yakalar.
    @Optional()
    private readonly ledger?: LedgerService,
  ) {}

  /**
   * "Ödemeniz aktarıldı" e-postası — payout transferi PayTR'de başarıyla
   * tamamlandığında satıcıya markalı bilgilendirme. Asla throw etmez.
   */
  private async sendPayoutReleasedEmail(
    sellerId: string,
    netAmount: number,
    iban: string,
  ): Promise<void> {
    try {
      const seller = await this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { displayName: true },
      });
      const last4 = (iban || "").replace(/\s/g, "").slice(-4);
      await this.notificationService.sendTemplateEmailToUser(
        sellerId,
        "payout-released-seller",
        {
          sellerName: seller?.displayName ?? "",
          payoutAmount: netAmount,
          bankAccountLast4: last4 || undefined,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `payout-released email failed for seller ${sellerId}: ${err?.message}`,
      );
    }
  }

  /**
   * Y4: TR IBAN format + ISO 7064 mod-97 checksum doğrulaması. Yazım hatalı IBAN'ları
   * PayTR'ye gitmeden yakalar (kör transfer riskini azaltır). Tek kaynak:
   * common/validators/tr-iban (DTO'daki IsTrIban ile aynı fonksiyon).
   */
  private isValidTrIban(iban: string): boolean {
    return isValidTrIban(iban);
  }

  /**
   * Payout aktarılamadı bildirimi — returned (banka geri gönderdi) veya kalıcı
   * failed. Satıcı banka bilgilerini düzeltebilsin diye başarı maili kadar
   * bu da zorunlu; geçici retry'larda ÇAĞRILMAZ (spam olmasın). Asla throw etmez.
   */
  private async sendPayoutProblemEmail(params: {
    sellerId: string;
    template: "payout-returned-seller" | "payout-failed-seller";
    netAmount: number;
    iban: string;
    reason?: string;
  }): Promise<void> {
    try {
      const seller = await this.prisma.user.findUnique({
        where: { id: params.sellerId },
        select: { displayName: true },
      });
      const last4 = (params.iban || "").replace(/\s/g, "").slice(-4);
      await this.notificationService.sendTemplateEmailToUser(
        params.sellerId,
        params.template,
        {
          sellerName: seller?.displayName ?? "",
          payoutAmount: params.netAmount,
          bankAccountLast4: last4 || undefined,
          failureReason: params.reason,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `${params.template} email failed for seller ${params.sellerId}: ${err?.message}`,
      );
    }
  }

  /**
   * Bu ödeme/sipariş için parayı bağlayan bir iade var mı? Payout OLUŞTURMA,
   * transfer ETME ve iade-void'lu payout'u yeniden kuyruğa alma yollarının
   * tamamı aynı guard'ı kullanır (tek kaynak).
   *
   * @returns engel nedeni (`refund_pending`) veya engel yoksa `null`
   */
  private async findBlockingRefund(target: {
    orderId: string | null;
    paymentId: string;
    tradeId?: string | null;
  }): Promise<"refund_pending" | null> {
    if (target.orderId) {
      const openRefund = await this.prisma.refundRequest.findFirst({
        where: {
          orderId: target.orderId,
          status: { in: OPEN_REFUND_STATUSES },
        },
        select: { id: true },
      });
      if (openRefund) return "refund_pending";
    }
    const activeAttempt = await this.prisma.refundAttempt.findFirst({
      where: {
        paymentId: target.paymentId,
        orderId: target.orderId,
        tradeId: target.tradeId ?? null,
        status: { in: UNRESOLVED_REFUND_ATTEMPT_STATUSES },
      },
      select: { id: true },
    });
    return activeAttempt ? "refund_pending" : null;
  }

  /**
   * Create PayoutTransfer records for all newly released holds.
   * Called after releaseHoldsDue() marks holds as released.
   */
  async createPayoutsForReleasedHolds(): Promise<number> {
    // 1) Order PaymentHolds released but no PayoutTransfer yet
    const releasedHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.released,
        payoutTransfer: null,
        // MONEY-M3: donuk (açık iade ile kilitli) hold'a payout OLUŞTURMA — defansif;
        // releaseHoldsDue zaten frozen'ı release etmez ama katmanlı guard.
        frozenByRefundId: null,
      },
      include: {
        payment: true,
        seller: { include: { bankAccount: true } },
      },
    });

    // KRİTİK: Sipariş, payment.order üzerinden DEĞİL hold.orderId üzerinden yüklenir.
    // Grup/sepet ödemelerinde Payment.orderId=null (checkoutGroupId'ye bağlı) olduğundan
    // payment.order da null'dır; eski kod `if (!payment?.order) continue` ile bu hold'ları
    // ATLIYORDU → grup siparişlerinin satıcıları HİÇ payout almıyordu (para kaybı).
    // hold.orderId her hold için HER ZAMAN doludur (per-order hold).
    const orderIds = [...new Set(releasedHolds.map((h) => h.orderId))];
    const orders = orderIds.length
      ? await this.prisma.order.findMany({ where: { id: { in: orderIds } } })
      : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    let created = 0;

    for (const hold of releasedHolds) {
      const payment = hold.payment;
      const order = orderById.get(hold.orderId);
      if (!payment || !order) continue;
      if (!PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status)) {
        this.logger.warn(
          `Payout skipped: order ${hold.orderId} is not payout eligible (status=${order.status})`,
        );
        continue;
      }

      // MONEY-M3: Bu siparişte AÇIK bir iade talebi varsa payout OLUŞTURMA. Yarış:
      // hold releaseAt'i geçip release edildikten HEMEN SONRA bir iade açılırsa,
      // freeze `held` hedeflediğinden `released` hold'u kaçırır → payout cron satıcıya
      // öder + alıcıya iade edilir → ÇİFT KAYIP. Açık iade varken bekle (iade terminal
      // olunca hold ya cancelled olur ya da unfreeze ile normal akışa döner).
      const blockingRefund = await this.findBlockingRefund({
        orderId: hold.orderId,
        paymentId: hold.paymentId,
      });
      if (blockingRefund) {
        this.logger.warn(
          `Payout skipped: order ${hold.orderId} has an unsettled refund (open request or unresolved attempt). Waiting for refund to terminalize.`,
        );
        continue;
      }

      // Adet bazlı kısmi iade: satıcıya yalnız iade EDİLMEYEN kısım ödenir.
      const netPayout = entitledNetFromHold(hold);
      if (netPayout <= PAYOUT_MIN_NET) {
        // Tamamı iade edilmiş → ödeme yapma (hold zaten cancelled olmalı; emniyet).
        continue;
      }

      const merchantOid =
        payment.providerConversationId?.trim() ||
        order.orderNumber.replace(/-/g, "");

      const bankAccount = hold.seller.bankAccount;
      // PayTR platform transfer referansı. Tekillik `transId` unique index'i
      // ile garanti; format diğer işlem referanslarıyla aynı ailede.
      const transId = await generateUniqueReference(
        REFERENCE_PREFIX.payoutTransfer,
        async (code) =>
          (await this.prisma.payoutTransfer.count({
            where: { transId: code },
          })) > 0,
      );
      const pendingAdjustment = await (
        this.prisma as any
      ).sellerAccountAdjustment?.findFirst({
        where: {
          sellerId: hold.sellerId,
          status: "open",
          remainingAmount: { gt: 0 },
        },
        select: { id: true },
      });
      if (pendingAdjustment) {
        const createdWithAdjustment = await this.createAdjustedOrderPayout({
          hold,
          order,
          merchantOid,
          transId,
          bankAccount,
          baseNetPayout: netPayout,
        });
        if (createdWithAdjustment) created++;
        continue;
      }

      await this.prisma.payoutTransfer.create({
        data: {
          paymentHoldId: hold.id,
          sellerId: hold.sellerId,
          amount: order.totalAmount,
          commission: order.commissionAmount,
          // Sipariş anında kesilen stopaj snapshot'ı (hold.amount zaten stopaj düşülmüş).
          // Muhtasar raporu completed transferlerin bu alanından beslenir. Kısmi iadede
          // stopaj yeniden hesaplanmaz (bilinen kenar durum — satıcı beyannamede mahsup eder).
          withholdingTax: order.withholdingTaxAmount ?? 0,
          netAmount: netPayout,
          merchantOid,
          transId,
          transferIban: bankAccount?.iban || "",
          transferName: bankAccount?.accountHolder || "",
          status: bankAccount ? PayoutStatus.pending : PayoutStatus.failed,
          failureReason: bankAccount ? null : "no_bank_account",
        },
      });
      created++;
    }

    // 2) TradeCashPayment released but no PayoutTransfer yet
    //
    // v2: her takasta İKİ ödeme satırı vardır ama karşı tarafa geçen tek kalem nakit
    // farktır — hizmet bedeli ve kargo platformda kalır. Farkı olmayan tarafın
    // satırında `recipientId` NULL'dur; onu buraya almak alıcısız transfer üretirdi.
    const releasedTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        releasedAt: { not: null },
        payoutTransfers: { none: {} },
        recipientId: { not: null },
        amount: { gt: 0 },
      },
      include: {
        trade: true,
        payment: true,
      },
    });

    for (const tcp of releasedTradeCash) {
      if (tcp.payment) {
        const activeRefundAttempt = await this.prisma.refundAttempt.findFirst({
          where: {
            paymentId: tcp.payment.id,
            tradeId: tcp.tradeId,
            status: {
              in: [
                RefundAttemptStatus.prepared,
                RefundAttemptStatus.submitting,
                RefundAttemptStatus.succeeded,
                RefundAttemptStatus.manual_review,
              ],
            },
          },
          select: { id: true },
        });
        if (activeRefundAttempt) continue;
      }
      // Sorgu zaten NULL alıcıları eliyor; bu yalnız tip daraltması (defansif).
      const recipientId = tcp.recipientId;
      if (!recipientId) continue;
      const recipient = await this.prisma.user.findUnique({
        where: { id: recipientId },
        include: { bankAccount: true },
      });
      if (!recipient) continue;

      const payment = tcp.payment;
      const merchantOid =
        payment?.providerConversationId?.trim() ||
        tcp.tradeId.replace(/-/g, "");

      const transId = await generateUniqueReference(
        REFERENCE_PREFIX.payoutTransfer,
        async (code) =>
          (await this.prisma.payoutTransfer.count({
            where: { transId: code },
          })) > 0,
      );
      const bankAccount = recipient.bankAccount;

      await this.prisma.payoutTransfer.create({
        data: {
          tradeCashPaymentId: tcp.id,
          sellerId: recipientId,
          amount: tcp.totalAmount,
          commission: tcp.commission,
          netAmount: tcp.amount,
          merchantOid,
          transId,
          transferIban: bankAccount?.iban || "",
          transferName: bankAccount?.accountHolder || "",
          status: bankAccount ? PayoutStatus.pending : PayoutStatus.failed,
          failureReason: bankAccount ? null : "no_bank_account",
        },
      });
      created++;
    }

    if (created > 0) {
      this.logger.log(`Created ${created} payout transfer(s)`);
    }
    return created;
  }

  private async createAdjustedOrderPayout(input: {
    hold: any;
    order: any;
    merchantOid: string;
    transId: string;
    bankAccount: { iban: string; accountHolder: string } | null;
    baseNetPayout: number;
  }): Promise<boolean> {
    const { hold, order, merchantOid, transId, bankAccount, baseNetPayout } =
      input;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "seller_account_adjustments"
        WHERE "seller_id" = ${hold.sellerId}
          AND "status" = 'open'
          AND "remaining_amount" > 0
        ORDER BY "created_at" ASC
        FOR UPDATE
      `;
      const existing = await tx.payoutTransfer.findUnique({
        where: { paymentHoldId: hold.id },
        select: { id: true },
      });
      if (existing) return false;

      const adjustments = await tx.sellerAccountAdjustment.findMany({
        where: {
          sellerId: hold.sellerId,
          status: "open",
          remainingAmount: { gt: 0 },
        },
        orderBy: { createdAt: "asc" },
      });
      let available = Math.round(baseNetPayout * 100) / 100;
      const allocations: Array<{
        adjustmentId: string;
        amount: number;
        remainingAmount: number;
      }> = [];
      for (const adjustment of adjustments) {
        if (available <= 0) break;
        const remaining = Number(adjustment.remainingAmount);
        const amount = Math.min(remaining, available);
        if (amount <= 0) continue;
        allocations.push({
          adjustmentId: adjustment.id,
          amount: Math.round(amount * 100) / 100,
          remainingAmount:
            Math.round(Math.max(0, remaining - amount) * 100) / 100,
        });
        available = Math.round(Math.max(0, available - amount) * 100) / 100;
      }
      const adjustmentDeduction =
        Math.round(
          allocations.reduce((sum, row) => sum + row.amount, 0) * 100,
        ) / 100;
      const netAmount =
        Math.round(Math.max(0, baseNetPayout - adjustmentDeduction) * 100) /
        100;
      const fullyConsumed = netAmount <= 0.01;
      const payout = await tx.payoutTransfer.create({
        data: {
          paymentHoldId: hold.id,
          sellerId: hold.sellerId,
          amount: order.totalAmount,
          commission: order.commissionAmount,
          withholdingTax: order.withholdingTaxAmount ?? 0,
          netAmount: fullyConsumed ? 0 : netAmount,
          adjustmentDeduction,
          merchantOid,
          transId,
          transferIban: bankAccount?.iban || "",
          transferName: bankAccount?.accountHolder || "",
          status: fullyConsumed
            ? PayoutStatus.completed
            : bankAccount
              ? PayoutStatus.pending
              : PayoutStatus.failed,
          processedAt: fullyConsumed ? new Date() : null,
          failureReason:
            fullyConsumed || bankAccount ? null : "no_bank_account",
        },
      });

      if (allocations.length > 0) {
        await tx.sellerAdjustmentApplication.createMany({
          data: allocations.map((allocation) => ({
            adjustmentId: allocation.adjustmentId,
            payoutTransferId: payout.id,
            amount: allocation.amount,
          })),
        });
        // F1 (ledger): kesinti escrow'dan platforma geçer. Capture'da hold.amount
        // kadar borçlanan seller_escrow, payout ledger'ında yalnız transfer edilen
        // net kadar kapanır — kesinti burada kapatılmazsa escrow'da kalıntı sonsuza
        // dek açık kalır (fullyConsumed payout'ta escrow'u kapatan TEK kayıt budur).
        //
        // FAIL-LOUD (eskiden best-effort): yazım payout ile AYNI tx'te olduğundan
        // hatayı yutmak "payout var, defterde kesinti yok" durumunu kalıcılaştırıyordu
        // — escrow kalıntısı sonsuza dek açık kalırdı. Fırlatmak payout'u geri alır;
        // sonraki tur yeniden dener. İdempotency anahtarı payout'tan türer (hold ↔
        // payout 1:1) → tekrar denemede çift kayıt DB'de düşer.
        if (adjustmentDeduction > 0) {
          await this.ledger?.record(tx, {
            eventType: LedgerEventType.adjustment,
            idempotencyKey: `adjustment:payout:${payout.id}`,
            entries: [
              {
                account: LedgerAccount.seller_debt_recovery,
                direction: LedgerDirection.debit,
                amount: adjustmentDeduction,
              },
              {
                account: LedgerAccount.seller_escrow,
                direction: LedgerDirection.credit,
                amount: adjustmentDeduction,
                sellerId: hold.sellerId,
              },
            ],
            refs: {
              payoutId: payout.id,
              sellerId: hold.sellerId,
              orderId: order.id,
              holdId: hold.id,
            },
            metadata: {
              allocations: allocations.map((a) => ({
                adjustmentId: a.adjustmentId,
                amount: a.amount,
              })),
            },
          });
        }
        for (const allocation of allocations) {
          const settled = allocation.remainingAmount <= 0.01;
          await tx.sellerAccountAdjustment.update({
            where: { id: allocation.adjustmentId },
            data: {
              remainingAmount: settled ? 0 : allocation.remainingAmount,
              status: settled ? "settled" : "open",
              settledAt: settled ? new Date() : null,
            },
          });
        }
      }
      return true;
    });
  }

  /**
   * Process pending PayoutTransfers — call PayTR Platform Transfer API.
   */
  async processPendingPayouts(): Promise<{
    processed: number;
    /** F2: aşama-1'de KABUL edilen (para henüz gitmemiş, callback bekleyen) talimatlar.
     *  processed'e sayılırsa scheduler log'u para gitmeden "N tamamlandı" der. */
    submitted: number;
    failed: number;
  }> {
    // Y15: Staging/test ortamında gerçek (geri alınamaz) banka transferini engelle.
    // PAYOUTS_DISABLED=true ise payout cron'u canlı transfer ATMAZ.
    if (this.configService.get<string>("PAYOUTS_DISABLED") === "true") {
      this.logger.warn(
        "Payout işleme devre dışı (PAYOUTS_DISABLED=true) — atlanıyor",
      );
      return { processed: 0, submitted: 0, failed: 0 };
    }

    const pending = await this.prisma.payoutTransfer.findMany({
      where: { status: PayoutStatus.pending },
      include: {
        paymentHold: {
          select: {
            paymentId: true,
            orderId: true,
            // Transfer öncesi bayat-net doğrulaması için gerekli (aşağıya bkz).
            amount: true,
            refundedAmount: true,
          },
        },
        tradeCashPayment: {
          select: {
            tradeId: true,
            payment: { select: { id: true } },
          },
        },
      },
      take: 50,
    });

    let processed = 0;
    let submitted = 0;
    let failed = 0;

    for (const payout of pending) {
      const refundTarget = payout.paymentHold
        ? {
            paymentId: payout.paymentHold.paymentId,
            orderId: payout.paymentHold.orderId,
            tradeId: null,
          }
        : payout.tradeCashPayment?.payment
          ? {
              paymentId: payout.tradeCashPayment.payment.id,
              orderId: null,
              tradeId: payout.tradeCashPayment.tradeId,
            }
          : null;
      if (refundTarget) {
        if (refundTarget.orderId) {
          const order = await this.prisma.order.findUnique({
            where: { id: refundTarget.orderId },
            select: { status: true },
          });
          if (
            !order ||
            !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status)
          ) {
            await this.prisma.payoutTransfer.updateMany({
              where: { id: payout.id, status: PayoutStatus.pending },
              data: {
                status: PayoutStatus.failed,
                failureReason: "order_not_payout_eligible",
              },
            });
            continue;
          }
        }
        const blockingRefund = await this.findBlockingRefund(refundTarget);
        if (blockingRefund) {
          await this.prisma.payoutTransfer.updateMany({
            where: { id: payout.id, status: PayoutStatus.pending },
            data: {
              status: PayoutStatus.failed,
              failureReason: blockingRefund,
            },
          });
          continue;
        }
      }

      // Bayat-net koruması: kısmi iade `pending` payout'u void ederken satırdaki
      // `netAmount`'u güncellemez ve `paymentHoldId` unique olduğundan düzeltilmiş
      // yeni bir payout oluşamaz. Admin satırı retry ile tekrar `pending` yaparsa
      // iade ÖNCESİ tutar transfer edilirdi (satıcıya fazla ödeme). Transferden
      // hemen önce hold'dan hak edilen net'i yeniden oku ve YALNIZ AŞAĞI yönlü
      // düzelt — satıcı kesintisi (adjustment) ile düşürülmüş net yükseltilmemeli.
      let netToTransfer = Number(payout.netAmount);
      if (payout.paymentHold) {
        const entitledNet = entitledNetFromHold(payout.paymentHold);
        if (entitledNet <= PAYOUT_MIN_NET) {
          const failedClaim = await this.prisma.payoutTransfer.updateMany({
            where: { id: payout.id, status: PayoutStatus.pending },
            data: {
              status: PayoutStatus.failed,
              failureReason: "fully_refunded",
            },
          });
          this.logger.warn(
            `Payout ${payout.id} iptal: hold tamamen iade edilmiş (net=${entitledNet}) — transfer yapılmadı`,
          );
          if (failedClaim.count > 0) failed++;
          continue;
        }
        if (entitledNet < netToTransfer) {
          this.logger.warn(
            `Payout ${payout.id} net tutarı düzeltildi: ${netToTransfer} → ${entitledNet} (kısmi iade sonrası bayat değer)`,
          );
          netToTransfer = entitledNet;
          await this.prisma.payoutTransfer.update({
            where: { id: payout.id },
            data: { netAmount: netToTransfer },
          });
        }
      }
      // Y5: İşleme anında satıcının GÜNCEL banka hesabını oku. Payout oluşturulurken
      // alınan IBAN/ad snapshot'ı bayatlamış olabilir (satıcı sonradan değiştirmiş
      // olabilir) → para eski IBAN'a gitmesin. Güncel değeri kullan + snapshot'ı tazele.
      let bankAccount = await this.prisma.sellerBankAccount.findUnique({
        where: { userId: payout.sellerId },
      });
      let transferIban = bankAccount?.iban || "";
      let transferName = bankAccount?.accountHolder || "";
      if (
        transferIban !== payout.transferIban ||
        transferName !== payout.transferName
      ) {
        await this.prisma.payoutTransfer.update({
          where: { id: payout.id },
          data: { transferIban, transferName },
        });
      }

      if (!transferIban || !transferName) {
        const failedClaim = await this.prisma.payoutTransfer.updateMany({
          where: { id: payout.id, status: PayoutStatus.pending },
          data: {
            status: PayoutStatus.failed,
            failureReason: "no_bank_account",
          },
        });
        if (failedClaim.count > 0) {
          failed++;
          await this.sendPayoutProblemEmail({
            sellerId: payout.sellerId,
            template: "payout-failed-seller",
            netAmount: netToTransfer,
            iban: transferIban,
            reason: "no_bank_account",
          });
        }
        continue;
      }

      // Y4: Transfer öncesi IBAN format/checksum kontrolü. Yazım hatalı IBAN PayTR'ye
      // gönderilmeden başarısız işaretlenir (satıcı düzeltir); kör transfer riskini azaltır.
      // (Format doğru ama yanlış hesap durumunu PayTR reddi / returned-transfer akışı yakalar.)
      if (!this.isValidTrIban(transferIban)) {
        const failedClaim = await this.prisma.payoutTransfer.updateMany({
          where: { id: payout.id, status: PayoutStatus.pending },
          data: {
            status: PayoutStatus.failed,
            failureReason: "invalid_iban_format",
          },
        });
        this.logger.warn(
          `Payout ${payout.id} için geçersiz IBAN formatı — transfer yapılmadı`,
        );
        if (failedClaim.count > 0) {
          failed++;
          await this.sendPayoutProblemEmail({
            sellerId: payout.sellerId,
            template: "payout-failed-seller",
            netAmount: netToTransfer,
            iban: transferIban,
            reason: "invalid_iban_format",
          });
        }
        continue;
      }

      // IBAN cooldown (F2.1): satıcı IBAN'ını YAKIN ZAMANDA değiştirdiyse bu turda
      // ödeme YAPMA — beklet (status pending kalır, sonraki cron tekrar dener).
      // Çalınan oturumla IBAN'ı değiştirip anında para çekme saldırısına karşı pencere;
      // satıcı değişikliği fark edip itiraz edebilir. İlk kayıtta ibanChangedAt null →
      // beklemez (ödemeler zaten teslimden ~14 gün sonra yapıldığından legit gecikme yok).
      if (
        bankAccount?.ibanChangedAt &&
        Date.now() - bankAccount.ibanChangedAt.getTime() < IBAN_COOLDOWN_MS
      ) {
        this.logger.warn(
          `Payout ${payout.id} beklemede: IBAN yakın zamanda değişti (cooldown). Sonraki turda denenecek.`,
        );
        continue;
      }

      // Atomik claim (K2): yalnızca hâlâ pending ise processing'e al. Cooldown
      // kontrolü claim'den önce yapıldığı için bekleyen payout processing'te takılmaz.
      const claim = await this.prisma.payoutTransfer.updateMany({
        where: { id: payout.id, status: PayoutStatus.pending },
        data: { status: PayoutStatus.processing },
      });
      if (claim.count === 0) {
        continue;
      }

      // TOCTOU guard: preflight ile sağlayıcı çağrısı arasında IBAN değişmiş olabilir.
      // Claim sonrasında tekrar oku; değişiklik/cooldown varsa claim'i güvenle bırak.
      bankAccount = await this.prisma.sellerBankAccount.findUnique({
        where: { userId: payout.sellerId },
      });
      const confirmedIban = bankAccount?.iban || "";
      const confirmedName = bankAccount?.accountHolder || "";
      const changedDuringClaim =
        confirmedIban !== transferIban || confirmedName !== transferName;
      const coolingDownNow =
        !!bankAccount?.ibanChangedAt &&
        Date.now() - bankAccount.ibanChangedAt.getTime() < IBAN_COOLDOWN_MS;
      if (changedDuringClaim || coolingDownNow) {
        await this.prisma.payoutTransfer.updateMany({
          where: { id: payout.id, status: PayoutStatus.processing },
          data: {
            status: PayoutStatus.pending,
            transferIban: confirmedIban,
            transferName: confirmedName,
          },
        });
        this.logger.warn(
          `Payout ${payout.id} beklemede: claim sırasında banka hesabı değişti veya cooldown başladı.`,
        );
        continue;
      }
      transferIban = confirmedIban;
      transferName = confirmedName;

      try {
        const result = await this.paymentProviders
          .resolve()
          .createPlatformTransfer({
            merchantOid: payout.merchantOid,
            transId: payout.transId,
            submerchantAmount: netToTransfer,
            totalAmount: Number(payout.amount),
            transferName,
            transferIban,
          });

        if (result.status === "success") {
          // Aşama-1 kabul anının snapshot'ı: callback (2. aşama) saatler/günler
          // sonra geldiğinde mail + ledger'ın kullanacağı GERÇEK gönderilen
          // tutar — adjustment/iade sonrası netAmount değişebilir.
          const submittedAt = new Date();
          if (this.transferCallbackEnabled()) {
            // 2. aşama akışı: PayTR yalnız TALİMATI kabul etti; para henüz
            // satıcıya ulaşmadı. Payout processing'te bekler; completed + yan
            // etkiler transfer sonucu callback'inde (handleTransferResultCallback).
            await this.prisma.payoutTransfer.update({
              where: { id: payout.id },
              data: {
                providerResponse: result as any,
                submittedAt,
                submittedAmount: netToTransfer,
              },
            });
            submitted++;
            this.logger.log(
              `Payout ${payout.transId} submitted (transfer sonucu callback'i bekleniyor): ${netToTransfer} TL → ${maskIban(transferIban)}`,
            );
          } else {
            // Eski akış (bayrak kapalı): senkron kabul = tamamlandı. PayTR
            // panelinde "Platform Transfer Sonucu Bildirim URL" tanımlanana
            // kadar güvenli varsayılan — aksi halde hiçbir payout tamamlanamaz.
            await this.prisma.payoutTransfer.update({
              where: { id: payout.id },
              data: {
                status: PayoutStatus.completed,
                providerResponse: result as any,
                processedAt: submittedAt,
                submittedAt,
                submittedAmount: netToTransfer,
              },
            });
            await this.applyPayoutCompletionEffects({
              payoutId: payout.id,
              sellerId: payout.sellerId,
              transId: payout.transId,
              transferIban,
              netAmount: netToTransfer,
            });
            processed++;
          }
        } else {
          await this.handlePayoutFailure(
            payout.id,
            result.err_msg || "PayTR error",
            result,
          );
          failed++;
        }
      } catch (error: any) {
        await this.handlePayoutFailure(payout.id, error.message, null);
        failed++;
      }
    }

    if (processed > 0 || submitted > 0 || failed > 0) {
      this.logger.log(
        `Payouts processed: ${processed} success, ${submitted} submitted (awaiting callback), ${failed} failed`,
      );
    }
    return { processed, submitted, failed };
  }

  /**
   * PAYTR_TRANSFER_CALLBACK_ENABLED=true → payout, aşama-1 kabulünde completed
   * olmaz; PayTR'nin transfer sonucu callback'ini (2. aşama) bekler.
   */
  private transferCallbackEnabled(): boolean {
    return (
      this.configService.get<string>("PAYTR_TRANSFER_CALLBACK_ENABLED") ===
      "true"
    );
  }

  /**
   * "Para satıcıya ulaştı" yan etkileri — TEK kaynak. Eski senkron akış da
   * 2. aşama callback'i de burayı çağırır: IBAN otomatik doğrulama, satıcıya
   * "ödemeniz aktarıldı" maili, ledger settle kaydı ve log. İki yerde
   * kopyalanırsa akışlar sessizce ayrışır.
   */
  private async applyPayoutCompletionEffects(params: {
    payoutId: string;
    sellerId: string;
    transId: string;
    transferIban: string;
    netAmount: number;
  }): Promise<void> {
    // Başarılı transfer = IBAN gerçek ve çalışıyor → otomatik doğrula.
    await this.syncBankAccountVerification(
      params.sellerId,
      params.transferIban,
      true,
    );
    await this.sendPayoutReleasedEmail(
      params.sellerId,
      params.netAmount,
      params.transferIban,
    );
    // 11.1c (G4/KVKK): tam IBAN loglanmaz — yalnız son 4 hane (email'le simetrik).
    this.logger.log(
      `Payout ${params.transId} completed: ${params.netAmount} TL → ${maskIban(params.transferIban)}`,
    );
    // Faz 6.2 (ledger): escrow → satıcıya ödendi. seller_escrow (borç) kapanır,
    // payout (dış çıkış) borçlanır. capture'daki seller_escrow debit'ini dengeler
    // → sipariş bazında escrow net 0'a iner.
    //
    // POST-COMMIT: payout zaten `completed` yazıldı; burada fırlatmak hiçbir şeyi
    // geri almaz → best-effort KALIR (tx-içi yollardan farklı olarak). Reconciliation
    // escrow kalıntısı olarak yakalar.
    //
    // `orderId`/`holdId` referansları escrow kalıntı invaryantının ön koşuludur:
    // sipariş bazlı escrow bakiyesi ancak settle kaydı siparişe bağlıysa kapanır.
    // Hold ↔ payout 1:1 (PayoutTransfer.paymentHoldId UNIQUE) → payout satırından türer.
    try {
      const net = params.netAmount;
      if (net > 0) {
        const payoutRow = await this.prisma.payoutTransfer.findUnique({
          where: { id: params.payoutId },
          select: {
            paymentHoldId: true,
            paymentHold: { select: { orderId: true } },
          },
        });
        await this.ledger?.record(this.prisma, {
          eventType: LedgerEventType.payout_completed,
          // Payout başına TEK settle kaydı: PayTR "OK" görene dek bildirimi yineler.
          idempotencyKey: `payout-completed:${params.payoutId}`,
          entries: [
            {
              account: LedgerAccount.seller_escrow,
              direction: LedgerDirection.credit,
              amount: net,
            },
            {
              account: LedgerAccount.payout,
              direction: LedgerDirection.debit,
              amount: net,
            },
          ],
          refs: {
            payoutId: params.payoutId,
            sellerId: params.sellerId,
            orderId: payoutRow?.paymentHold?.orderId ?? null,
            holdId: payoutRow?.paymentHoldId ?? null,
          },
        });
      }
    } catch (e: any) {
      this.logger.warn(
        `Ledger payout kaydı başarısız (payout ${params.payoutId}): ${e?.message}`,
      );
    }
  }

  /**
   * PayTR platform transfer SONUCU callback'i (2. aşama). PayTR, panelde
   * tanımlı "Platform Transfer Sonucu Bildirim URL"e tamamlanan transferlerin
   * trans_id listesini POST'lar; "OK" yanıtı görmedikçe bildirimi tekrarlar.
   * Bu yüzden geçersiz gövde/hash dahil HER durumda "OK" dönülür — sorun
   * yalnız loglanır, statü değişmez.
   *
   * `transIds` HAM gövde string'idir: hash bu ham string üzerinden doğrulanır
   * (parse/re-serialize hash'i bozar), JSON parse doğrulamadan SONRA yapılır.
   */
  async handleTransferResultCallback(
    transIds: string | undefined,
    hash: string | undefined,
  ): Promise<string> {
    if (!transIds || !hash) {
      this.logger.warn(
        `PayTR transfer callback eksik alan: trans_ids=${transIds ? "var" : "yok"} hash=${hash ? "var" : "yok"}`,
      );
      return "OK";
    }

    const valid = this.paymentProviders
      .resolve()
      .verifyTransferCallback({ transIds, hash });
    if (!valid) {
      this.logger.error(
        `PayTR transfer callback hash uyuşmadı — bildirim YOK SAYILDI. trans_ids=${transIds.slice(0, 200)}`,
      );
      return "OK";
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(transIds);
    } catch {
      this.logger.error(
        `PayTR transfer callback trans_ids JSON parse edilemedi: ${transIds.slice(0, 200)}`,
      );
      return "OK";
    }
    if (!Array.isArray(parsed)) {
      this.logger.error(
        `PayTR transfer callback trans_ids dizi değil: ${transIds.slice(0, 200)}`,
      );
      return "OK";
    }

    for (const raw of parsed) {
      const transId = String(raw);
      const payout = await this.prisma.payoutTransfer.findUnique({
        where: { transId },
      });
      if (!payout) {
        this.logger.warn(
          `PayTR transfer callback: bilinmeyen trans_id=${transId} — atlandı`,
        );
        continue;
      }

      // Atomik claim + idempotens: yalnız processing → completed. Tekrarlanan
      // callback'te count=0 döner, mail/ledger ikinci kez tetiklenmez.
      const claim = await this.prisma.payoutTransfer.updateMany({
        where: { id: payout.id, status: PayoutStatus.processing },
        data: { status: PayoutStatus.completed, processedAt: new Date() },
      });
      if (claim.count === 0) {
        if (payout.status !== PayoutStatus.completed) {
          this.logger.warn(
            `PayTR transfer callback: payout ${payout.id} beklenmeyen statüde (${payout.status}) — dokunulmadı`,
          );
        }
        continue;
      }

      await this.applyPayoutCompletionEffects({
        payoutId: payout.id,
        sellerId: payout.sellerId,
        transId: payout.transId,
        transferIban: payout.transferIban,
        // Aşama-1'de gerçekten gönderilen tutar; eski kayıtlar için netAmount.
        netAmount: Number(payout.submittedAmount ?? payout.netAmount),
      });
    }

    return "OK";
  }

  /**
   * Kısmi iade nedeniyle void edilmiş (`failed/order_refunded`) payout'ları,
   * iade tamamen sonuçlandıktan sonra yeniden kuyruğa alır.
   *
   * Neden gerekli: `PayoutTransfer.paymentHoldId` UNIQUE olduğundan
   * `createPayoutsForReleasedHolds` aynı hold için ikinci bir payout üretemez;
   * void edilen satır elle retry edilmezse satıcı iade DIŞINDA kalan hakkını
   * hiç alamaz. Tutar burada düzeltilmez — `processPendingPayouts` transferden
   * önce hak edilen net'i yeniden hesaplar (tek kaynak).
   */
  async requeueRefundVoidedPayouts(): Promise<number> {
    const voided = await this.prisma.payoutTransfer.findMany({
      where: {
        status: PayoutStatus.failed,
        failureReason: "order_refunded",
        paymentHoldId: { not: null },
      },
      include: {
        paymentHold: {
          select: {
            paymentId: true,
            orderId: true,
            amount: true,
            refundedAmount: true,
          },
        },
      },
      take: 50,
    });

    let requeued = 0;
    for (const payout of voided) {
      const hold = payout.paymentHold;
      if (!hold) continue;

      // Satıcıya ödenecek bakiye kalmadıysa (tam iade) dokunma.
      if (entitledNetFromHold(hold) <= PAYOUT_MIN_NET) continue;

      const order = await this.prisma.order.findUnique({
        where: { id: hold.orderId },
        select: { status: true },
      });
      if (!order || !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status)) {
        continue;
      }

      // İade hâlâ sürüyorsa bekle — aksi halde iade ile payout yarışır.
      const blockingRefund = await this.findBlockingRefund({
        orderId: hold.orderId,
        paymentId: hold.paymentId,
      });
      if (blockingRefund) continue;

      // CAS: yalnız hâlâ bu iade-void durumundaysa promote et.
      const claim = await this.prisma.payoutTransfer.updateMany({
        where: {
          id: payout.id,
          status: PayoutStatus.failed,
          failureReason: "order_refunded",
        },
        data: { status: PayoutStatus.pending, failureReason: null },
      });
      if (claim.count === 0) continue;

      requeued++;
      this.logger.log(
        `Payout ${payout.id} yeniden kuyruğa alındı: kısmi iade sonrası satıcının kalan hakkı ödenecek`,
      );
    }

    return requeued;
  }

  /**
   * Process retry-pending payouts (exponential backoff).
   */
  async processRetryPayouts(): Promise<number> {
    const retryable = await this.prisma.payoutTransfer.findMany({
      where: {
        status: PayoutStatus.retry_pending,
        nextRetryAt: { lte: new Date() },
      },
      take: 20,
    });

    let retried = 0;
    for (const payout of retryable) {
      // Atomik claim (K2): yalnızca hâlâ retry_pending ise pending'e al; çift-promosyonu
      // ve dolayısıyla aynı payout'un iki kez işlenmesini önler.
      const claim = await this.prisma.payoutTransfer.updateMany({
        where: { id: payout.id, status: PayoutStatus.retry_pending },
        data: { status: PayoutStatus.pending },
      });
      if (claim.count === 0) {
        continue;
      }
      retried++;
    }

    return retried;
  }

  /**
   * Y3: 'processing'te takılı kalmış (zombie) payout'ları tespit et ve ALARM ver.
   * Bir instance payout'u processing'e aldıktan sonra PayTR çağrısı tamamlanmadan çökerse,
   * kayıt kalıcı processing'te kalır; hiçbir cron onu seçmez. PayTR'de transfer GERÇEKTEN
   * gitmiş olabileceğinden otomatik yeniden işlemek çift-ödeme riski taşır — bu yüzden
   * güvenli aksiyon yeniden-deneme DEĞİL, tespit + yüksek-öncelikli log (manuel inceleme).
   */
  async detectStuckProcessingPayouts(thresholdMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    // submittedAt=null şartı: PayTR'ye İLETİLMİŞ (aşama-1 kabul edilmiş) payout
    // 2. aşama callback'ini beklerken processing'te durur — bu zombi değildir.
    // Zombi = claim edilmiş ama PayTR çağrısı hiç tamamlanamadan kalmış kayıt.
    const stuck = await this.prisma.payoutTransfer.findMany({
      where: {
        status: PayoutStatus.processing,
        submittedAt: null,
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        transId: true,
        sellerId: true,
        netAmount: true,
        updatedAt: true,
      },
    });
    for (const p of stuck) {
      this.logger.error(
        `ZOMBIE PAYOUT (manuel inceleme gerekir): payout ${p.id} transId=${p.transId} ` +
          `sellerId=${p.sellerId} netAmount=${p.netAmount} — ${thresholdMinutes} dk'dan uzun ` +
          `süredir 'processing'te. PayTR'de transfer gitmiş OLABİLİR; yeniden işlemeden önce ` +
          `PayTR panelinden doğrulayın (çift-ödeme riski).`,
      );
    }

    // Callback gecikmesi: talimat kabul edilmiş ama sonuç bildirimi makul
    // süredir gelmemiş. Otomatik aksiyon YOK (transfer gerçekleşmiş olabilir);
    // alarm + manuel inceleme. Bayrak kapalıyken bu duruma düşülmez (senkron
    // akış submittedAt yazdığı anda completed yapar) → sorgu doğal olarak boş.
    const callbackCutoff = new Date(Date.now() - PAYOUT_CALLBACK_OVERDUE_MS);
    const overdue = await this.prisma.payoutTransfer.findMany({
      where: {
        status: PayoutStatus.processing,
        submittedAt: { lt: callbackCutoff },
      },
      select: { id: true, transId: true, sellerId: true, submittedAt: true },
    });
    for (const p of overdue) {
      this.logger.error(
        `PAYOUT CALLBACK GECİKTİ (manuel inceleme gerekir): payout ${p.id} transId=${p.transId} ` +
          `sellerId=${p.sellerId} — talimat ${p.submittedAt?.toISOString()} tarihinde kabul edildi, ` +
          `transfer sonucu bildirimi hâlâ gelmedi. PayTR panelinden transferi ve panel ` +
          `"Platform Transfer Sonucu Bildirim URL" ayarını kontrol edin.`,
      );
    }

    return stuck.length + overdue.length;
  }

  /**
   * Check for returned transfers from PayTR and update status.
   */
  async checkReturnedTransfers(): Promise<number> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 7);

    const startDate = yesterday.toISOString().replace("T", " ").slice(0, 19);
    const endDate = now.toISOString().replace("T", " ").slice(0, 19);

    try {
      const result = await this.paymentProviders
        .resolve()
        .getReturnedTransfers({
          startDate,
          endDate,
        });

      if (result.status !== "success" || !Array.isArray(result.data)) {
        return 0;
      }

      let updated = 0;
      for (const returned of result.data) {
        const transfer = await this.prisma.payoutTransfer.findUnique({
          where: { transId: returned.trans_id },
        });
        // `processing` de kapsanır: 2. aşama akışında transfer bankadan geri
        // dönerse PayTR onu tamamlananlar callback'ine hiç koymaz — payout
        // completed'a geçemeden geri döner. Yalnız completed'ı yakalasaydık
        // kayıt sonsuza dek processing'te kalırdı.
        if (
          transfer &&
          (transfer.status === PayoutStatus.completed ||
            transfer.status === PayoutStatus.processing)
        ) {
          await this.prisma.payoutTransfer.update({
            where: { id: transfer.id },
            data: {
              status: PayoutStatus.returned,
              failureReason: `Geri döndü: ${returned.reason || "bilinmeyen neden"}`,
              providerResponse: returned as any,
            },
          });
          // Transfer geri döndü = IBAN sorunlu → doğrulamayı geri al.
          await this.syncBankAccountVerification(
            transfer.sellerId,
            transfer.transferIban,
            false,
          );
          // Satıcı haber almalı: para escrow'a döndü, IBAN güncellenmeli.
          await this.sendPayoutProblemEmail({
            sellerId: transfer.sellerId,
            template: "payout-returned-seller",
            netAmount: Number(transfer.netAmount),
            iban: transfer.transferIban,
            reason: returned.reason || undefined,
          });
          updated++;
          this.logger.warn(
            `Payout ${transfer.transId} returned: ${returned.reason}`,
          );
        }
      }

      return updated;
    } catch (error: any) {
      this.logger.error(`Check returned transfers failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Satıcının banka hesabının doğrulama durumunu payout sonucuna göre günceller.
   * IBAN, transfer anındaki IBAN ile eşleşmiyorsa (satıcı sonradan değiştirmişse) dokunmaz.
   */
  private async syncBankAccountVerification(
    sellerId: string,
    transferIban: string,
    verified: boolean,
  ): Promise<void> {
    if (!sellerId || !transferIban) return;
    try {
      const account = await this.prisma.sellerBankAccount.findUnique({
        where: { userId: sellerId },
      });
      if (!account || account.iban !== transferIban) return;
      if (account.isVerified === verified) return;
      await this.prisma.sellerBankAccount.update({
        where: { userId: sellerId },
        data: {
          isVerified: verified,
          verifiedAt: verified ? new Date() : null,
        },
      });
      this.logger.log(
        `Bank account for seller ${sellerId} isVerified=${verified} (payout sonucu).`,
      );
    } catch (error: any) {
      this.logger.error(`syncBankAccountVerification failed: ${error.message}`);
    }
  }

  private async handlePayoutFailure(
    payoutId: string,
    reason: string,
    providerResponse: any,
  ) {
    const payout = await this.prisma.payoutTransfer.findUnique({
      where: { id: payoutId },
    });
    if (!payout) return;

    const newRetryCount = payout.retryCount + 1;

    if (newRetryCount >= payout.maxRetries) {
      await this.prisma.payoutTransfer.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
          failureReason: reason,
          retryCount: newRetryCount,
          providerResponse: providerResponse as any,
        },
      });
      this.logger.error(
        `Payout ${payout.transId} permanently failed after ${newRetryCount} attempts: ${reason}`,
      );
      // Yalnız KALICI başarısızlıkta mail — geçici retry'lar sessiz.
      await this.sendPayoutProblemEmail({
        sellerId: payout.sellerId,
        template: "payout-failed-seller",
        netAmount: Number(payout.netAmount),
        iban: payout.transferIban,
        reason,
      });
    } else {
      // Exponential backoff: 15min, 1hr, 4hr
      const backoffMinutes = Math.pow(4, newRetryCount) * 15;
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + backoffMinutes);

      await this.prisma.payoutTransfer.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.retry_pending,
          failureReason: reason,
          retryCount: newRetryCount,
          nextRetryAt,
          providerResponse: providerResponse as any,
        },
      });
      this.logger.warn(
        `Payout ${payout.transId} failed (attempt ${newRetryCount}/${payout.maxRetries}), retry at ${nextRetryAt.toISOString()}`,
      );
    }
  }
}
