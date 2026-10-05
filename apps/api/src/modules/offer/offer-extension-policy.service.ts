import { Injectable } from "@nestjs/common";
import { OfferStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { resolveTimingAction } from "../../common/timing-rules";
import { UserBlockService } from "../user-block/user-block.service";
import {
  offerExtensionBlocker,
  type OfferExtensionCandidate,
} from "./helpers/offer-expiry";

/**
 * extend_once için TEK uygunluk kapısı. Üç tüketici aynı kuralı çağırır, bu
 * yüzden birbirinden ayrışamaz:
 *   - cron (`OfferSchedulerService`): uzat mı, expire mı?
 *   - kullanıcı ekranları ve kabul / karşı teklif (`OfferService`): süresi
 *     geçmiş ama cron'un uzatacağı teklif "expired" gösterilmez / reddedilmez.
 *   - admin görünen durumu (`AdminOfferQueryService`).
 * Cron'un uzatmayacağı teklif (eylem kapalı, hak kullanılmış, ilan/hesap/engel
 * engeli) bugünkü gibi süresi dolmuş sayılır.
 */
@Injectable()
export class OfferExtensionPolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userBlocks: UserBlockService,
  ) {}

  /**
   * Saf kural (`offerExtensionBlocker`: hak kullanılmış mı, ilan satışta mı,
   * taraflar yasaklı/silinmiş mi) + taraflar arası engel / hesap şeridi.
   */
  async canExtend(
    offer: OfferExtensionCandidate & { buyerId: string; sellerId: string },
  ): Promise<boolean> {
    if (offerExtensionBlocker(offer)) return false;
    return !(await this.userBlocks.isBlockedEither(
      offer.buyerId,
      offer.sellerId,
    ));
  }

  /**
   * Eylem extend_once ∧ teklif `pending`: karar için gereken adayı okur; değilse
   * null. `willExtend` ve `isExtendable` aynı okumayı paylaşır (tek kaynak).
   */
  private async loadPendingCandidate(offerId: string) {
    if (
      (await resolveTimingAction(this.prisma, "offerExpiryHours")) !==
      "extend_once"
    ) {
      return null;
    }
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: {
        status: true,
        expiresAt: true,
        extendedAt: true,
        buyerId: true,
        sellerId: true,
        product: {
          select: { status: true, quantity: true, reservedQuantity: true },
        },
        buyer: { select: { isBanned: true, deletedAt: true } },
        seller: { select: { isBanned: true, deletedAt: true } },
      },
    });
    return offer && offer.status === OfferStatus.pending ? offer : null;
  }

  /**
   * Süresi geçmiş bir `pending` teklifi bir SONRAKİ cron turu uzatacak mı?
   * (Eylem extend_once ∧ canExtend.) Süresi geçmemiş ya da pending olmayan
   * teklif için `false` — çağıranlar yalnız süresi geçmiş teklifte sorar.
   */
  async willExtend(offerId: string, now: Date = new Date()): Promise<boolean> {
    const offer = await this.loadPendingCandidate(offerId);
    if (!offer || offer.expiresAt >= now) return false;
    return this.canExtend(offer);
  }

  /**
   * ZAMANDAN BAĞIMSIZ karar: teklif süresi geçmiş olsaydı uzatılır mıydı?
   * (`willExtend`'in süre koşulu hariç hâli.) Kabul/karşı teklif işlem AÇILMADAN
   * bunu okur: işlem bir bağlantı tutarken politika kendi sorgularıyla ikinci
   * bir bağlantı beklemesin (havuz tükenmesi). Süre karşılaştırması işlem
   * içinde, kilitli satırın `expiresAt`'ı ile yapılır.
   */
  async isExtendable(offerId: string): Promise<boolean> {
    const offer = await this.loadPendingCandidate(offerId);
    return offer ? this.canExtend(offer) : false;
  }
}
