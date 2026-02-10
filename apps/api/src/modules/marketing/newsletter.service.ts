import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  private generateUnsubscribeToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Subscribe email to newsletter (guest signup). If already exists and was unsubscribed, re-subscribe.
   */
  async subscribe(dto: NewsletterSubscribeDto): Promise<{ message: string; alreadySubscribed?: boolean }> {
    const token = this.generateUnsubscribeToken();
    const newsletter = dto.newsletter !== false;
    const promotions = dto.promotions !== false;

    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
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
        return { message: 'Aboneliğiniz yeniden aktif edildi.' };
      }
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { newsletter, promotions, updatedAt: new Date() },
      });
      return { message: 'Zaten abonesiniz. Tercihleriniz güncellendi.', alreadySubscribed: true };
    }

    await this.prisma.newsletterSubscriber.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        newsletter,
        promotions,
        unsubscribeToken: token,
      },
    });
    return { message: 'Bültene başarıyla abone oldunuz. Teşekkürler!' };
  }

  /**
   * Unsubscribe by token (from email link).
   */
  async unsubscribeByToken(token: string): Promise<{ message: string }> {
    const subscriber = await this.prisma.newsletterSubscriber.findFirst({
      where: { unsubscribeToken: token },
    });
    if (!subscriber) {
      throw new NotFoundException('Geçersiz veya kullanılmış abonelik linki.');
    }
    if (subscriber.unsubscribedAt) {
      return { message: 'Bu e-posta zaten abonelikten çıkarılmış.' };
    }
    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date(), updatedAt: new Date() },
    });
    return { message: 'Bülten aboneliğiniz iptal edildi.' };
  }

  /**
   * Unsubscribe by email (for users who lost the link). No auth required but rate-limit in production.
   */
  async unsubscribeByEmail(email: string): Promise<{ message: string }> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!subscriber) {
      return { message: 'Bu e-posta adresi bülten listemizde bulunamadı.' };
    }
    if (subscriber.unsubscribedAt) {
      return { message: 'Bu e-posta zaten abonelikten çıkarılmış.' };
    }
    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date(), updatedAt: new Date() },
    });
    return { message: 'Bülten aboneliğiniz iptal edildi.' };
  }
}
