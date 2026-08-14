import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { PaymentStatus, OrderStatus } from "@prisma/client";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";

/**
 * Kalan mutabakat süpürmeleri: kayıtlı kart senkronu (CAPI) + eksik fatura telafisi.
 * PaymentReconciliationService facade'i aynı imzalarla buraya delege eder.
 */
@Injectable()
export class MiscReconciliationService {
  private readonly logger = new Logger(MiscReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderRegistry,
  ) {}

  /**
   * CAPI (Faz 3): store_card ödemesi sonrası callback'te dönen utoken ile kullanıcının
   * PayTR'daki kayıtlı kartlarını çekip SavedCard tablosuna upsert eder (recurring için).
   * KART NUMARASI/CVV SAKLANMAZ — yalnız PayTR token'ları + maskeli bilgi. ctoken @unique
   * olduğundan idempotenttir. Callback'ten çağrılır (dairesel bağımlılık olmasın diye persist
   * burada; kart listele/sil yönetimi MembershipService'tedir).
   */
  async syncSavedCardsFromUtoken(
    userId: string,
    utoken: string,
    mandate?: { ip?: string; termsVersion?: string },
  ): Promise<number> {
    if (!utoken) return 0;
    const cards = await this.paymentProviders.resolve().capiListCards(utoken);
    let saved = 0;
    for (const c of cards) {
      if (!c.ctoken) continue;
      await this.prisma.savedCard.upsert({
        where: { ctoken: c.ctoken },
        create: {
          userId,
          provider: "paytr",
          utoken,
          ctoken: c.ctoken,
          last4: c.last4 || "____",
          brand: c.brand,
          // PayTR CAPI liste meta (gözlemlenebilirlik/UX) — PAN/CVV DEĞİL.
          bank: c.bank,
          cardType: c.type,
          cardScheme: c.schema,
          businessCard: c.businessCard,
          expMonth: c.month,
          expYear: c.year,
          requireCvv: c.requireCvv ?? false,
          status: "active",
          mandateAcceptedAt: new Date(),
          mandateIp: mandate?.ip,
          mandateTermsVersion: mandate?.termsVersion,
        },
        update: {
          utoken,
          last4: c.last4 || undefined,
          brand: c.brand,
          bank: c.bank,
          cardType: c.type,
          cardScheme: c.schema,
          businessCard: c.businessCard,
          expMonth: c.month,
          expYear: c.year,
          requireCvv: c.requireCvv ?? false,
          status: "active",
        },
      });
      saved++;
    }
    if (saved > 0) {
      this.logger.log(
        `SavedCard senkron: user=${userId} ${saved} kart kaydedildi/güncellendi`,
      );
    }
    return saved;
  }

  /**
   * O6: Ödemesi tamamlanmış ama faturası oluşmamış siparişleri bulup faturayı yeniden üret.
   * processSuccessfulPayment'ta fatura üretimi tx-sonrası best-effort olduğundan (geçici hata
   * yutulup loglanır) bu sweep güvenilir bir TELAFİ/retry görevi görür. Yalnız faturası
   * OLMAYAN (invoice:null) siparişleri seçtiğinden çift-fatura riski yoktur. Membership/boost
   * sanal siparişlerine fatura kesilmez → hariç tutulur.
   */
  async reconcileMissingInvoices(): Promise<{ generated: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.preparing,
            OrderStatus.shipped,
            OrderStatus.delivered,
            OrderStatus.awaiting_buyer_confirmation,
            OrderStatus.completed,
          ],
        },
        payment: { is: { status: PaymentStatus.completed } },
        invoice: null,
        NOT: {
          OR: [
            { productId: { startsWith: "membership-" } },
            { productId: { startsWith: "boost-" } },
          ],
        },
      },
      select: { id: true, orderNumber: true },
      take: 50,
    });

    // ESKİ makbuz KALDIRILDI + eLogo e-Arşiv faturaları ARTIK TESLİMDE kesiliyor
    // (order-scheduler.processDeliveredOrders). Bu telafi yolu ARTIK HİÇBİR ŞEY ÜRETMEZ;
    // eski "generated++" yanıltıcı "N fatura üretildi" logu üretiyordu → 0 döndürüyoruz.
    void orders;
    return { generated: 0 };
  }
}
