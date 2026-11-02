import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { errorMessage } from "../../../common/helpers/error-message";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { PermanentOutboxError } from "../../outbox/outbox-errors";
import {
  OUTBOX_GUEST_ORDER_CLAIM,
  type GuestOrderClaimPayload,
} from "../../outbox/outbox.types";
import { SYSTEM_GUEST_EMAIL } from "../../invoicing/invoice/guest-recipient";
import { InvoicingService } from "../../invoicing/invoicing.service";
import { InvoiceService } from "../../invoice/invoice.service";
import { RefundService } from "../../refund/refund.service";
import { PaymentService } from "../../payment/payment.service";
import { SentryService } from "../../sentry/sentry.service";
import { SellerInvoiceService } from "../invoice/seller-invoice.service";

/** Why a claim wrote nothing before it looked at any order. */
export type GuestOrderClaimSkip =
  /** Missing, unverified, deleted, test-lane, or the system guest itself. */
  | "not_eligible"
  /** A fresh database: no guest checkout has happened yet. */
  | "no_system_guest";

export interface GuestOrderClaimResult {
  skipped: GuestOrderClaimSkip | null;
  /** Orders moved from the system guest to the user in this run. */
  claimedOrderIds: string[];
  packages: number;
  checkoutGroups: number;
  refundRequests: number;
  fiscalInvoiceRecipientLinks: number;
  fiscalInvoiceBuyerLinks: number;
  /** Legacy order summaries (`Invoice`). */
  orderSummaries: number;
  sellerInvoices: number;
  /**
   * Umbrellas left on the guest because another buyer's order is under them
   * (never expected: one guest checkout has one e-mail).
   */
  skippedPackageIds: string[];
  skippedCheckoutGroupIds: string[];
  /** Claimed orders still waiting for payment (checked with PayTR after commit). */
  pendingPaymentOrderIds: string[];
}

export interface GuestOrderClaimOptions {
  /**
   * After commit, ask PayTR about the claimed orders that still wait for
   * payment (a guest who never reached the success page). Default `true`;
   * the repair script passes `false` (decision D4).
   */
  verifyPendingPayments?: boolean;
}

interface CandidateOrder {
  id: string;
  buyerId: string;
  checkoutGroupId: string | null;
  packageId: string | null;
  status: OrderStatus;
}

/**
 * The part of the `orderPackage` and `checkoutGroup` delegates the claim
 * uses: both umbrellas carry `buyerId` and their `orders`.
 */
interface UmbrellaTable {
  findMany(args: {
    where: { id: { in: string[] }; buyerId: string };
    select: {
      id: true;
      orders: {
        where: { buyerId: { not: string } };
        select: { id: true };
        take: number;
      };
    };
  }): Promise<Array<{ id: string; orders: Array<{ id: string }> }>>;
  updateMany(args: {
    where: { id: { in: string[] }; buyerId: string };
    data: { buyerId: string };
  }): Promise<{ count: number }>;
}

const emptyResult = (
  skipped: GuestOrderClaimSkip | null = null,
): GuestOrderClaimResult => ({
  skipped,
  claimedOrderIds: [],
  packages: 0,
  checkoutGroups: 0,
  refundRequests: 0,
  fiscalInvoiceRecipientLinks: 0,
  fiscalInvoiceBuyerLinks: 0,
  orderSummaries: 0,
  sellerInvoices: 0,
  skippedPackageIds: [],
  skippedCheckoutGroupIds: [],
  pendingPaymentOrderIds: [],
});

const distinct = (values: Array<string | null>): string[] => [
  ...new Set(values.filter((v): v is string => v !== null)),
];

/**
 * Guest order claim: once an account proves an e-mail, every guest order
 * bought with that e-mail becomes fully the account's, in one transaction.
 *
 * Guest checkout writes the group, the package and the order on the shared
 * system guest user and keeps the buyer's e-mail only in
 * `order.shippingAddress.guestEmail`. Ownership checks read the buyer id on
 * every umbrella (`GET /orders/groups` lists by `CheckoutGroup.buyerId`), so
 * moving only `order.buyerId` hides the order from its buyer. This moves the
 * orders, their packages and checkout groups, the guest-era refund requests
 * and the guest links on the fiscal invoices, order summaries and seller
 * invoices. It also heals orders an earlier, partial claim moved without
 * their umbrellas.
 *
 * Triggered through the `guest_order.claim` outbox event that every "e-mail
 * is now verified" moment writes (auth `GuestOrderClaimRequestService`).
 * Idempotent: every write is guarded on "still on the system guest", so a
 * repeat or a concurrent run moves nothing. Snapshots stay as they are:
 * `shippingAddress` (incl. `isGuestOrder`), `CheckoutGroup.isGuest`, consent
 * records and the ledger.
 */
@Injectable()
export class OrderGuestClaimService implements OnModuleInit {
  private readonly logger = new Logger(OrderGuestClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxHandlers: OutboxHandlerRegistry,
    private readonly refunds: RefundService,
    private readonly invoicing: InvoicingService,
    private readonly orderSummaries: InvoiceService,
    private readonly sellerInvoices: SellerInvoiceService,
    private readonly payments: PaymentService,
    private readonly sentry: SentryService,
  ) {}

  onModuleInit(): void {
    this.outboxHandlers.register(OUTBOX_GUEST_ORDER_CLAIM, async (payload) => {
      const userId = (payload as Partial<GuestOrderClaimPayload> | null)
        ?.userId;
      if (typeof userId !== "string" || userId.length === 0) {
        throw new PermanentOutboxError(
          `${OUTBOX_GUEST_ORDER_CLAIM} payload without a userId`,
        );
      }
      await this.claimForUser(userId);
    });
  }

  async claimForUser(
    userId: string,
    options: GuestOrderClaimOptions = {},
  ): Promise<GuestOrderClaimResult> {
    const result = await this.prisma.$transaction((tx) =>
      this.claimInTransaction(tx, userId),
    );
    this.report(userId, result);

    if (
      (options.verifyPendingPayments ?? true) &&
      result.pendingPaymentOrderIds.length > 0
    ) {
      // After commit, fire and forget: a PayTR status check never fails or
      // delays the claim.
      // The PayTR reconcile cron is the backstop if this never runs.
      void this.verifyClaimedGuestPayments(
        userId,
        result.pendingPaymentOrderIds,
      ).catch((e: unknown) =>
        this.logger.warn(
          `Guest claim payment check failed (user=${userId}): ${errorMessage(e)}`,
        ),
      );
    }
    return result;
  }

  private async claimInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<GuestOrderClaimResult> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isEmailVerified: true,
        deletedAt: true,
        isTestAccount: true,
      },
    });
    // Test-lane accounts stay out: the lane may be purged with its orders.
    if (
      !user ||
      !user.isEmailVerified ||
      user.deletedAt ||
      user.isTestAccount
    ) {
      return emptyResult("not_eligible");
    }
    const guest = await tx.user.findUnique({
      where: { email: SYSTEM_GUEST_EMAIL },
      select: { id: true },
    });
    if (!guest) return emptyResult("no_system_guest");
    if (guest.id === user.id) return emptyResult("not_eligible");

    // Locks the candidates in id order, so a concurrent claim for the same
    // user waits here and then finds nothing on the guest. Candidates are
    // the guest's orders bought with this e-mail and the user's own guest-born
    // orders (an earlier claim may have left their umbrellas behind).
    const candidates = await tx.$queryRaw<CandidateOrder[]>`
      SELECT id,
             buyer_id AS "buyerId",
             checkout_group_id AS "checkoutGroupId",
             package_id AS "packageId",
             status
      FROM orders
      WHERE (buyer_id = ${guest.id}
             AND lower(btrim(shipping_address->>'guestEmail')) = lower(btrim(${user.email})))
         OR (buyer_id = ${user.id}
             AND NULLIF(btrim(shipping_address->>'guestEmail'), '') IS NOT NULL)
      ORDER BY id
      FOR UPDATE
    `;
    if (candidates.length === 0) return emptyResult();

    const moved = { guestUserId: guest.id, userId: user.id };
    const result = emptyResult();
    const toClaim = candidates.filter((o) => o.buyerId === guest.id);
    if (toClaim.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: toClaim.map((o) => o.id) }, buyerId: guest.id },
        data: { buyerId: user.id },
      });
      result.claimedOrderIds = toClaim.map((o) => o.id);
      result.pendingPaymentOrderIds = toClaim
        .filter((o) => o.status === OrderStatus.pending_payment)
        .map((o) => o.id);
    }

    const orderIds = candidates.map((o) => o.id);
    const packageIds = distinct(candidates.map((o) => o.packageId));
    const packages = await this.moveUmbrellas(
      tx.orderPackage,
      packageIds,
      moved,
    );
    const groups = await this.moveUmbrellas(
      tx.checkoutGroup,
      distinct(candidates.map((o) => o.checkoutGroupId)),
      moved,
    );
    result.packages = packages.moved;
    result.skippedPackageIds = packages.skipped;
    result.checkoutGroups = groups.moved;
    result.skippedCheckoutGroupIds = groups.skipped;

    const refunds = await this.refunds.reassignGuestRequests(tx, {
      ...moved,
      orderIds,
    });
    result.refundRequests = refunds.moved;

    const invoiceLinks = await this.invoicing.reassignGuestInvoiceLinks(tx, {
      ...moved,
      // A package left on the guest keeps its documents there too.
      packageOrOrderIds: [
        ...orderIds,
        ...packageIds.filter((id) => !packages.skipped.includes(id)),
      ],
      refundRequestIds: refunds.requestIds,
    });
    result.fiscalInvoiceRecipientLinks = invoiceLinks.recipientLinks;
    result.fiscalInvoiceBuyerLinks = invoiceLinks.buyerLinks;

    result.orderSummaries = await this.orderSummaries.reassignGuestBuyer(tx, {
      ...moved,
      orderIds,
    });
    result.sellerInvoices = await this.sellerInvoices.reassignGuestBuyer(tx, {
      ...moved,
      orderIds,
    });
    return result;
  }

  /**
   * Moves the packages or checkout groups still on the guest, but only those
   * whose every order now belongs to the user. One with another buyer's
   * order stays on the guest and is reported.
   */
  private async moveUmbrellas(
    table: UmbrellaTable,
    ids: string[],
    moved: { guestUserId: string; userId: string },
  ): Promise<{ moved: number; skipped: string[] }> {
    if (ids.length === 0) return { moved: 0, skipped: [] };
    const onGuest = await table.findMany({
      where: { id: { in: ids }, buyerId: moved.guestUserId },
      select: {
        id: true,
        orders: {
          where: { buyerId: { not: moved.userId } },
          select: { id: true },
          take: 1,
        },
      },
    });
    const movable = onGuest.filter((u) => u.orders.length === 0);
    const skipped = onGuest.filter((u) => u.orders.length > 0).map((u) => u.id);
    if (movable.length === 0) return { moved: 0, skipped };
    const updated = await table.updateMany({
      where: {
        id: { in: movable.map((u) => u.id) },
        buyerId: moved.guestUserId,
      },
      data: { buyerId: moved.userId },
    });
    return { moved: updated.count, skipped };
  }

  /**
   * Ids and counts only: never the e-mail. A skipped umbrella is an alarm
   * (`error`, one per entity): the buyer cannot see that order until someone
   * looks at the data.
   */
  private report(userId: string, result: GuestOrderClaimResult): void {
    for (const id of result.skippedCheckoutGroupIds) {
      this.logger.error(
        `Guest order claim left checkout group ${id} on the system guest: it holds another buyer's order (user=${userId})`,
      );
    }
    for (const id of result.skippedPackageIds) {
      this.logger.error(
        `Guest order claim left package ${id} on the system guest: it holds another buyer's order (user=${userId})`,
      );
    }
    const wrote =
      result.claimedOrderIds.length +
      result.packages +
      result.checkoutGroups +
      result.refundRequests +
      result.fiscalInvoiceRecipientLinks +
      result.fiscalInvoiceBuyerLinks +
      result.orderSummaries +
      result.sellerInvoices;
    if (wrote === 0) return;
    const summary =
      `user=${userId} orders=${result.claimedOrderIds.length} ` +
      `packages=${result.packages} groups=${result.checkoutGroups} ` +
      `refundRequests=${result.refundRequests} ` +
      `fiscalInvoiceLinks=${result.fiscalInvoiceRecipientLinks}/${result.fiscalInvoiceBuyerLinks} ` +
      `orderSummaries=${result.orderSummaries} sellerInvoices=${result.sellerInvoices}`;
    this.logger.log(`Guest order claim: ${summary}`);
    this.sentry.addBreadcrumb({
      category: "guest_order_claim",
      message: summary,
      level: "info",
    });
  }

  /**
   * A guest who never reached the success page (and whose callback never
   * came) leaves the order waiting for payment. Ask PayTR once per pending
   * payment; if it was paid, the order completes. Never throws.
   */
  private async verifyClaimedGuestPayments(
    userId: string,
    orderIds: string[],
  ): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, checkoutGroupId: true },
      orderBy: { id: "asc" },
    });
    const checked = new Set<string>();
    for (const order of orders) {
      try {
        const payment = await this.prisma.payment.findFirst({
          where: {
            status: PaymentStatus.pending,
            OR: [
              { orderId: order.id },
              ...(order.checkoutGroupId
                ? [{ checkoutGroupId: order.checkoutGroupId }]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        // One group payment covers every order of the group.
        if (!payment || checked.has(payment.id)) continue;
        checked.add(payment.id);
        const res = await this.payments.verifyPaymentFromClient(payment.id, {
          internal: true,
        });
        if (res.completed) {
          this.logger.log(
            `Recovered guest payment ${payment.id} for claimed order ${order.id} (user=${userId})`,
          );
        }
      } catch (e: unknown) {
        this.logger.warn(
          `Guest claim payment check failed for order ${order.id} (user=${userId}): ${errorMessage(e)}`,
        );
      }
    }
  }
}
