import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma";
import { NewsletterSubscribeDto } from "./dto/newsletter-subscribe.dto";

/** Haftalık bülten / aylık promosyon gönderimlerinin alıcı kaydı. */
export interface NewsletterRecipient {
  email: string;
  unsubscribeToken: string;
  /** Eşleşen bir üye varsa görünen adı; misafir abonelerde undefined. */
  displayName?: string;
}

/**
 * Bülten aboneliği.
 *
 * `newsletter_subscribers` pazarlama gönderimlerinin TEK alıcı listesidir.
 * Üyeler de (kayıtta veya profilinden pazarlama iznini açtığında) bu tabloya
 * yazılır — eskiden gönderim `user` tablosundan okuduğu için formdan abone olan
 * misafirler hiçbir zaman mail almıyordu. Tek listede tutmanın ikinci faydası:
 * her alıcının gerçek bir `unsubscribeToken`'ı olur, yani tek tıkla çıkış linki
 * hem misafir hem üye için aynı şekilde çalışır.
 */
@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateUnsubscribeToken(): string {
    return randomBytes(32).toString("hex");
  }

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Subscribe email to newsletter (guest signup). If already exists and was unsubscribed, re-subscribe.
   */
  async subscribe(
    dto: NewsletterSubscribeDto,
  ): Promise<{ message: string; alreadySubscribed?: boolean }> {
    const token = this.generateUnsubscribeToken();
    const newsletter = dto.newsletter !== false;
    const promotions = dto.promotions !== false;
    const email = this.normalizeEmail(dto.email);

    // İkisi de kapalıysa hiçbir şey almayan bir abonelik oluşurdu; kullanıcı da
    // "abone oldunuz" mesajını görüp mail beklerdi.
    if (!newsletter && !promotions) {
      throw new BadRequestException("En az bir e-posta tercihi seçmelisiniz.");
    }

    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.unsubscribedAt) {
        await this.prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            newsletter,
            promotions,
            unsubscribedAt: null,
            unsubscribeToken: token,
            updatedAt: new Date(),
          },
        });
        return { message: "Aboneliğiniz yeniden aktif edildi." };
      }
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { newsletter, promotions, updatedAt: new Date() },
      });
      return {
        message: "Zaten abonesiniz. Tercihleriniz güncellendi.",
        alreadySubscribed: true,
      };
    }

    await this.prisma.newsletterSubscriber.create({
      data: {
        email,
        newsletter,
        promotions,
        unsubscribeToken: token,
      },
    });
    return { message: "Bültene başarıyla abone oldunuz. Teşekkürler!" };
  }

  /**
   * Üyenin pazarlama izni değiştiğinde abone listesini hizalar. Kayıt sırasında
   * ve profil ayarlarından çağrılır; hata fırlatmaz — pazarlama listesi
   * senkronu, kayıt/profil güncelleme akışını düşürmemeli.
   */
  async syncUserConsent(email: string, accepts: boolean): Promise<void> {
    if (!email?.trim()) return;
    const normalized = this.normalizeEmail(email);

    try {
      if (accepts) {
        await this.prisma.newsletterSubscriber.upsert({
          where: { email: normalized },
          create: {
            email: normalized,
            newsletter: true,
            promotions: true,
            unsubscribeToken: this.generateUnsubscribeToken(),
          },
          update: {
            newsletter: true,
            promotions: true,
            unsubscribedAt: null,
            updatedAt: new Date(),
          },
        });
        return;
      }

      // İzin kapatıldı: abone satırı varsa çıkış işaretlenir, yoksa bir şey yapılmaz.
      await this.prisma.newsletterSubscriber.updateMany({
        where: { email: normalized, unsubscribedAt: null },
        data: { unsubscribedAt: new Date(), updatedAt: new Date() },
      });
    } catch (error: any) {
      this.logger.error(
        `Bülten listesi senkronu başarısız (${normalized}): ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Gönderim alıcıları — `kind` hangi tercih alanına bakılacağını seçer
   * ('newsletter' haftalık bülten, 'promotions' aylık promosyonlar).
   *
   * Sayfalama zorunlu: eski kod `take: 1000` ile çekip filtreyi bellekte
   * yapıyordu, yani 1000. kayıttan sonrası hiç mail almıyordu.
   */
  async listRecipients(
    kind: "newsletter" | "promotions",
    options: { skip: number; take: number },
  ): Promise<NewsletterRecipient[]> {
    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null, [kind]: true },
      select: { email: true, unsubscribeToken: true },
      orderBy: { createdAt: "asc" },
      skip: options.skip,
      take: options.take,
    });
    if (subscribers.length === 0) return [];

    // Üye olan alıcıları isimle selamlayabilmek için tek sorguda eşleştir.
    // Banlı üyelere pazarlama maili gitmemeli.
    const users = await this.prisma.user.findMany({
      where: { email: { in: subscribers.map((s) => s.email) } },
      select: { email: true, displayName: true, isBanned: true },
    });
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    return subscribers
      .filter((s) => !byEmail.get(s.email)?.isBanned)
      .map((s) => ({
        email: s.email,
        unsubscribeToken: s.unsubscribeToken,
        displayName: byEmail.get(s.email)?.displayName ?? undefined,
      }));
  }

  /** Çıkış yapan e-posta bir üyeye aitse profil tercihini de kapat. */
  private async clearUserConsent(email: string): Promise<void> {
    try {
      await this.prisma.user.updateMany({
        where: { email, acceptsMarketingEmails: true },
        data: { acceptsMarketingEmails: false },
      });
    } catch (error: any) {
      this.logger.error(
        `Üye pazarlama izni kapatılamadı (${email}): ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Unsubscribe by token (from email link).
   */
  async unsubscribeByToken(token: string): Promise<{ message: string }> {
    const subscriber = await this.prisma.newsletterSubscriber.findFirst({
      where: { unsubscribeToken: token },
    });
    if (!subscriber) {
      throw new NotFoundException("Geçersiz veya kullanılmış abonelik linki.");
    }
    if (subscriber.unsubscribedAt) {
      return { message: "Bu e-posta zaten abonelikten çıkarılmış." };
    }
    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date(), updatedAt: new Date() },
    });
    await this.clearUserConsent(subscriber.email);
    return { message: "Bülten aboneliğiniz iptal edildi." };
  }

  /**
   * Unsubscribe by email (for users who lost the link). No auth required but rate-limit in production.
   */
  async unsubscribeByEmail(email: string): Promise<{ message: string }> {
    const normalized = this.normalizeEmail(email);
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
    });
    if (!subscriber) {
      // Üye kaydı varsa (henüz abone satırı oluşmamışsa) tercihi yine de kapat.
      await this.clearUserConsent(normalized);
      return { message: "Bu e-posta adresi bülten listemizde bulunamadı." };
    }
    if (subscriber.unsubscribedAt) {
      await this.clearUserConsent(normalized);
      return { message: "Bu e-posta zaten abonelikten çıkarılmış." };
    }
    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date(), updatedAt: new Date() },
    });
    await this.clearUserConsent(normalized);
    return { message: "Bülten aboneliğiniz iptal edildi." };
  }
}
