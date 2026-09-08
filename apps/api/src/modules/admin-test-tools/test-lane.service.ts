import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProductStatus, SellerType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma";
import { AccountLaneService } from "../account-lane/account-lane.service";
import { i18nMessage } from "../i18n";
import { CreateTestAccountDto } from "./dto/create-test-account.dto";

export interface TestAccountRow {
  id: string;
  adminCode: string;
  email: string;
  displayName: string;
  isSeller: boolean;
  createdAt: Date;
  orders: number;
  listings: number;
}

export interface TestLaneResetResult {
  accounts: number;
  deleted: Record<string, number>;
  listingsReactivated: number;
}

/** Test hesabına açılan varsayılan teslimat adresi; tester adres girmeden checkout'a ulaşır. */
const DEFAULT_TEST_ADDRESS = {
  title: "Test",
  city: "İstanbul",
  district: "Kadıköy",
  address: "Test Sokak No:1 D:1 (test şeridi — gerçek gönderi yapılmaz)",
  zipCode: "34710",
};

/**
 * Canlı ortamdaki test şeridinin yönetimi (yalnız süper-admin, controller gate'ler).
 *
 * - Hesap açma: doğrulanmış (e-posta/telefon), `isTestAccount=true`, varsayılan adresli.
 *   Reviewer SMS/e-posta doğrulaması yapamaz; bu yüzden hesap hazır gelir.
 * - Şerit sıfırlama: test hesaplarının İŞLEM kayıtlarını siler (sipariş, ödeme, takas,
 *   teklif, sepet, ledger…), hesapları ve ilanları korur; satılan ilanları yeniden
 *   satışa açar. Silme sırası FK zincirini izler ve tek transaction'da koşar.
 *
 * Silme filtreleri şerit damgasından (`isTest`) ve test hesap kimliklerinden gelir;
 * canlı bir satır bu sorgulara hiçbir koşulda girmez.
 */
@Injectable()
export class TestLaneService {
  private readonly logger = new Logger(TestLaneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lanes: AccountLaneService,
  ) {}

  async listAccounts(): Promise<TestAccountRow[]> {
    const rows = await this.prisma.user.findMany({
      where: { isTestAccount: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        adminCode: true,
        email: true,
        displayName: true,
        isSeller: true,
        createdAt: true,
        _count: {
          select: {
            buyerOrders: { where: { isTest: true } },
            products: true,
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      adminCode: r.adminCode,
      email: r.email,
      displayName: r.displayName,
      isSeller: r.isSeller,
      createdAt: r.createdAt,
      orders: r._count.buyerOrders,
      listings: r._count.products,
    }));
  }

  async createAccount(dto: CreateTestAccountDto): Promise<TestAccountRow> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(dto.phone ? [{ phone: dto.phone }] : [])] },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        i18nMessage("server.auth.emailAlreadyRegistered"),
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const isSeller = dto.isSeller ?? false;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone: dto.phone ?? null,
          passwordHash,
          displayName: dto.displayName.trim(),
          usernameClaimedAt: new Date(),
          isSeller,
          sellerType: isSeller ? SellerType.individual : null,
          isTestAccount: true,
          isVerified: true,
          isEmailVerified: true,
          isPhoneVerified: !!dto.phone,
          acceptsMarketingEmails: false,
        },
        select: {
          id: true,
          adminCode: true,
          email: true,
          displayName: true,
          isSeller: true,
          createdAt: true,
        },
      });
      await tx.address.create({
        data: {
          userId: created.id,
          fullName: created.displayName,
          phone: dto.phone ?? "+905000000000",
          isDefault: true,
          ...DEFAULT_TEST_ADDRESS,
        },
      });
      return created;
    });
    await this.lanes.invalidate(user.id);
    this.logger.log(`Test lane account created ${user.adminCode} (${email})`);
    return { ...user, orders: 0, listings: 0 };
  }

  /**
   * Test şeridinin işlem geçmişini temizler. Sıra FK zincirini izler:
   * ledger → iade → hold/payout → kargo → fatura/komisyon → ödeme → sipariş →
   * paket → sepet grubu → takas → teklif → sepet. Hesaplar ve ilanlar kalır.
   */
  async resetLane(): Promise<TestLaneResetResult> {
    const accounts = await this.prisma.user.findMany({
      where: { isTestAccount: true },
      select: { id: true },
    });
    const userIds = accounts.map((a) => a.id);
    if (userIds.length === 0) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    const inUsers = { in: userIds };
    const testOrder: Prisma.OrderWhereInput = { isTest: true };
    const testPayment: Prisma.PaymentWhereInput = { isTest: true };
    const testTrade: Prisma.TradeWhereInput = { isTest: true };

    const [orderIds, paymentIds, packageIds] = await Promise.all([
      this.prisma.order
        .findMany({ where: testOrder, select: { id: true } })
        .then((r) => r.map((o) => o.id)),
      this.prisma.payment
        .findMany({ where: testPayment, select: { id: true } })
        .then((r) => r.map((p) => p.id)),
      this.prisma.orderPackage
        .findMany({ where: { sellerId: inUsers }, select: { id: true } })
        .then((r) => r.map((p) => p.id)),
    ]);

    const deleted: Record<string, number> = {};
    const count = (key: string, r: { count: number }) => {
      deleted[key] = r.count;
    };

    const listingsReactivated = await this.prisma.$transaction(
      async (tx) => {
        count(
          "ledgerEntries",
          await tx.ledgerEntry.deleteMany({ where: { isTest: true } }),
        );
        count(
          "refundAttempts",
          await tx.refundAttempt.deleteMany({
            where: {
              OR: [
                { payment: testPayment },
                { order: testOrder },
                { trade: testTrade },
              ],
            },
          }),
        );
        count(
          "refundFinancialComponents",
          await tx.refundFinancialComponent.deleteMany({
            where: { refundRequest: { order: testOrder } },
          }),
        );
        count(
          "refundRequests",
          await tx.refundRequest.deleteMany({ where: { order: testOrder } }),
        );
        count(
          "payoutTransfers",
          await tx.payoutTransfer.deleteMany({
            where: {
              OR: [
                { paymentHold: { payment: testPayment } },
                { tradeCashPayment: { trade: testTrade } },
              ],
            },
          }),
        );
        count(
          "paymentHolds",
          await tx.paymentHold.deleteMany({ where: { payment: testPayment } }),
        );
        count(
          "shipmentEvents",
          await tx.shipmentEvent.deleteMany({
            where: { shipment: { order: testOrder } },
          }),
        );
        count(
          "shipments",
          await tx.shipment.deleteMany({ where: { order: testOrder } }),
        );
        count(
          "ratings",
          await tx.rating.deleteMany({ where: { orderId: { in: orderIds } } }),
        );
        count(
          "invoices",
          await tx.invoice.deleteMany({ where: { order: testOrder } }),
        );
        count(
          "commissionLedgers",
          await tx.commissionLedger.deleteMany({ where: { order: testOrder } }),
        );
        count(
          "providerEvents",
          await tx.paymentProviderEvent.deleteMany({
            where: { paymentId: { in: paymentIds } },
          }),
        );
        count("payments", await tx.payment.deleteMany({ where: testPayment }));
        count("orders", await tx.order.deleteMany({ where: testOrder }));
        count(
          "packageShippingSettlements",
          await tx.packageShippingSettlement.deleteMany({
            where: { packageId: { in: packageIds } },
          }),
        );
        count(
          "orderPackages",
          await tx.orderPackage.deleteMany({ where: { sellerId: inUsers } }),
        );
        count(
          "checkoutGroups",
          await tx.checkoutGroup.deleteMany({ where: { buyerId: inUsers } }),
        );
        count("trades", await tx.trade.deleteMany({ where: testTrade }));
        count(
          "offers",
          await tx.offer.deleteMany({
            where: { OR: [{ buyerId: inUsers }, { sellerId: inUsers }] },
          }),
        );
        count(
          "cartItems",
          await tx.cartItem.deleteMany({
            where: { cart: { userId: inUsers } },
          }),
        );
        // Satılan/tükenen test ilanları yeniden satışa açılır; stok en az 1 olur.
        const reactivated = await tx.product.updateMany({
          where: {
            sellerId: inUsers,
            status: ProductStatus.sold,
          },
          data: {
            status: ProductStatus.active,
            quantity: 1,
            reservedQuantity: 0,
          },
        });
        await tx.product.updateMany({
          where: {
            sellerId: inUsers,
            status: ProductStatus.active,
            quantity: 0,
          },
          data: { quantity: 1, reservedQuantity: 0 },
        });
        return reactivated.count;
      },
      { timeout: 60_000 },
    );

    this.logger.warn(
      `Test lane reset: ${userIds.length} accounts, deleted=${JSON.stringify(deleted)}, listingsReactivated=${listingsReactivated}`,
    );
    return { accounts: userIds.length, deleted, listingsReactivated };
  }
}
