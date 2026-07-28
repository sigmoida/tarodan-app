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
   * PayTR'ye gitmeden yakalar (kör transfer riskini azaltır). "TR" + 24 rakam = 26 hane.
   */
  private isValidTrIban(iban: string): boolean {
    const v = (iban || "").replace(/\s/g, "").toUpperCase();
    if (!/^TR\d{24}$/.test(v)) return false;
    const rearranged = v.slice(4) + v.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (c) =>
      (c.charCodeAt(0) - 55).toString(),
    );
    let remainder = 0;
    for (const ch of numeric) {
      remainder = (remainder * 10 + Number(ch)) % 97;
    }
    return remainder === 1;
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
      const openRefund = await this.prisma.refundRequest.findFirst({
        where: {
          orderId: hold.orderId,
          status: { in: OPEN_REFUND_STATUSES },
        },
        select: { id: true },
      });
      if (openRefund) {
        this.logger.warn(
          `Payout skipped: order ${hold.orderId} has an open refund (released hold not frozen in time). Waiting for refund to terminalize.`,
        );
        continue;
      }
      const activeRefundAttempt = await this.prisma.refundAttempt.findFirst({
        where: {
          paymentId: hold.paymentId,
          orderId: hold.orderId,
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
      if (activeRefundAttempt) {
        this.logger.warn(
          `Payout skipped: order ${hold.orderId} has unresolved refund attempt ${activeRefundAttempt.id}`,
        );
        continue;
      }

      // Adet bazlı kısmi iade: satıcıya yalnız iade EDİLMEYEN kısım ödenir.
      const netPayout = Number(hold.amount) - Number(hold.refundedAmount ?? 0);
      if (netPayout <= 0.01) {
        // Tamamı iade edilmiş → ödeme yapma (hold zaten cancelled olmalı; emniyet).
        continue;
      }

      const merchantOid =
        payment.providerConversationId?.trim() ||
        order.orderNumber.replace(/-/g, "");

      const bankAccount = hold.seller.bankAccount;
      const transId = `ORD${hold.orderId.replace(/-/g, "").slice(0, 20)}${Date.now()}`;

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
    const releasedTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        releasedAt: { not: null },
        payoutTransfers: { none: {} },
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
      const recipientId = tcp.recipientId;
      const recipient = await this.prisma.user.findUnique({
        where: { id: recipientId },
        include: { bankAccount: true },
      });
      if (!recipient) continue;

      const payment = tcp.payment;
      const merchantOid =
        payment?.providerConversationId?.trim() ||
        tcp.tradeId.replace(/-/g, "");

      const transId = `TRD${tcp.tradeId.replace(/-/g, "").slice(0, 20)}${Date.now()}`;
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

  /**
   * Process pending PayoutTransfers — call PayTR Platform Transfer API.
   */
  async processPendingPayouts(): Promise<{
    processed: number;
    failed: number;
  }> {
    // Y15: Staging/test ortamında gerçek (geri alınamaz) banka transferini engelle.
    // PAYOUTS_DISABLED=true ise payout cron'u canlı transfer ATMAZ.
    if (this.configService.get<string>("PAYOUTS_DISABLED") === "true") {
      this.logger.warn(
        "Payout işleme devre dışı (PAYOUTS_DISABLED=true) — atlanıyor",
      );
      return { processed: 0, failed: 0 };
    }

    const pending = await this.prisma.payoutTransfer.findMany({
      where: { status: PayoutStatus.pending },
      include: {
        paymentHold: { select: { paymentId: true, orderId: true } },
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
          const [order, openRefund] = await Promise.all([
            this.prisma.order.findUnique({
              where: { id: refundTarget.orderId },
              select: { status: true },
            }),
            this.prisma.refundRequest.findFirst({
              where: {
                orderId: refundTarget.orderId,
                status: { in: OPEN_REFUND_STATUSES },
              },
              select: { id: true },
            }),
          ]);
          if (
            !order ||
            !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
            openRefund
          ) {
            await this.prisma.payoutTransfer.updateMany({
              where: { id: payout.id, status: PayoutStatus.pending },
              data: {
                status: PayoutStatus.failed,
                failureReason: openRefund
                  ? "refund_pending"
                  : "order_not_payout_eligible",
              },
            });
            continue;
          }
        }
        const activeRefundAttempt = await this.prisma.refundAttempt.findFirst({
          where: {
            paymentId: refundTarget.paymentId,
            orderId: refundTarget.orderId,
            tradeId: refundTarget.tradeId,
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
        if (activeRefundAttempt) {
          await this.prisma.payoutTransfer.updateMany({
            where: { id: payout.id, status: PayoutStatus.pending },
            data: {
              status: PayoutStatus.failed,
              failureReason: "refund_pending",
            },
          });
          continue;
        }
      }
      // Atomik claim (K2): yalnızca hâlâ pending ise processing'e al. Çoklu instance
      // veya api+worker aynı cron'u koşarsa satır başına yalnızca bir koşucu kazanır;
      // count=0 → başka bir koşucu aldı ya da iade void etti → atla. PayTR'ye çift
      // transfer gitmesini DB seviyesinde engeller.
      const claim = await this.prisma.payoutTransfer.updateMany({
        where: { id: payout.id, status: PayoutStatus.pending },
        data: { status: PayoutStatus.processing },
      });
      if (claim.count === 0) {
        continue;
      }

      // Y5: İşleme anında satıcının GÜNCEL banka hesabını oku. Payout oluşturulurken
      // alınan IBAN/ad snapshot'ı bayatlamış olabilir (satıcı sonradan değiştirmiş
      // olabilir) → para eski IBAN'a gitmesin. Güncel değeri kullan + snapshot'ı tazele.
      const bankAccount = await this.prisma.sellerBankAccount.findUnique({
        where: { userId: payout.sellerId },
      });
      const transferIban = bankAccount?.iban || "";
      const transferName = bankAccount?.accountHolder || "";
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
        await this.prisma.payoutTransfer.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.failed,
            failureReason: "no_bank_account",
          },
        });
        failed++;
        continue;
      }

      // Y4: Transfer öncesi IBAN format/checksum kontrolü. Yazım hatalı IBAN PayTR'ye
      // gönderilmeden başarısız işaretlenir (satıcı düzeltir); kör transfer riskini azaltır.
      // (Format doğru ama yanlış hesap durumunu PayTR reddi / returned-transfer akışı yakalar.)
      if (!this.isValidTrIban(transferIban)) {
        await this.prisma.payoutTransfer.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.failed,
            failureReason: "invalid_iban_format",
          },
        });
        this.logger.warn(
          `Payout ${payout.id} için geçersiz IBAN formatı — transfer yapılmadı`,
        );
        failed++;
        continue;
      }

      // IBAN cooldown (F2.1): satıcı IBAN'ını YAKIN ZAMANDA değiştirdiyse bu turda
      // ödeme YAPMA — beklet (status pending kalır, sonraki cron tekrar dener).
      // Çalınan oturumla IBAN'ı değiştirip anında para çekme saldırısına karşı pencere;
      // satıcı değişikliği fark edip itiraz edebilir. İlk kayıtta ibanChangedAt null →
      // beklemez (ödemeler zaten teslimden ~14 gün sonra yapıldığından legit gecikme yok).
      const IBAN_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 gün
      if (
        bankAccount?.ibanChangedAt &&
        Date.now() - bankAccount.ibanChangedAt.getTime() < IBAN_COOLDOWN_MS
      ) {
        this.logger.warn(
          `Payout ${payout.id} beklemede: IBAN yakın zamanda değişti (cooldown). Sonraki turda denenecek.`,
        );
        continue;
      }

      try {
        const result = await this.paymentProviders
          .resolve()
          .createPlatformTransfer({
            merchantOid: payout.merchantOid,
            transId: payout.transId,
            submerchantAmount: Number(payout.netAmount),
            totalAmount: Number(payout.amount),
            transferName,
            transferIban,
          });

        if (result.status === "success") {
          await this.prisma.payoutTransfer.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.completed,
              providerResponse: result as any,
              processedAt: new Date(),
            },
          });
          // Başarılı transfer = IBAN gerçek ve çalışıyor → otomatik doğrula.
          await this.syncBankAccountVerification(
            payout.sellerId,
            payout.transferIban,
            true,
          );
          await this.sendPayoutReleasedEmail(
            payout.sellerId,
            Number(payout.netAmount),
            payout.transferIban,
          );
          processed++;
          // 11.1c (G4/KVKK): tam IBAN loglanmaz — yalnız son 4 hane (email'le simetrik).
          this.logger.log(
            `Payout ${payout.transId} completed: ${payout.netAmount} TL → ${maskIban(payout.transferIban)}`,
          );
          // Faz 6.2 (ledger): escrow → satıcıya ödendi. seller_escrow (borç) kapanır,
          // payout (dış çıkış) borçlanır. capture'daki seller_escrow debit'ini dengeler
          // → sipariş bazında escrow net 0'a iner. Best-effort (payout'u bozmaz).
          try {
            const net = Number(payout.netAmount);
            if (net > 0)
              await this.ledger?.record(this.prisma, {
                eventType: LedgerEventType.payout_completed,
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
                  payoutId: payout.id,
                  sellerId: payout.sellerId,
                },
              });
          } catch (e: any) {
            this.logger.warn(
              `Ledger payout kaydı başarısız (payout ${payout.id}): ${e?.message}`,
            );
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

    if (processed > 0 || failed > 0) {
      this.logger.log(
        `Payouts processed: ${processed} success, ${failed} failed`,
      );
    }
    return { processed, failed };
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
    const stuck = await this.prisma.payoutTransfer.findMany({
      where: { status: PayoutStatus.processing, updatedAt: { lt: cutoff } },
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
    return stuck.length;
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
        if (transfer && transfer.status === PayoutStatus.completed) {
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
