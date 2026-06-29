import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma';
import { NetGsmProvider } from '../notification/providers/netgsm.provider';

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  static readonly CODE_TTL_MS = 3 * 60 * 1000; // 3 dakika
  static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 sn
  static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly netgsm: NetGsmProvider,
  ) {}

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async sendCode(userId: string, phone: string): Promise<{ message: string }> {
    const normalized = this.netgsm.formatTurkishNumber(phone);

    // Başka kullanıcıya kayıtlı mı?
    const taken = await this.prisma.user.findFirst({
      where: { phone: normalized, id: { not: userId } },
    });
    if (taken) {
      throw new ConflictException('Bu telefon numarası başka bir hesapta kayıtlı');
    }

    // Resend cooldown: son aktif token 60 sn içindeyse engelle
    const last = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      last &&
      Date.now() - new Date(last.createdAt).getTime() < PhoneVerificationService.RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException('Çok sık deneme. Lütfen biraz sonra tekrar deneyin.');
    }

    // Numarayı kullanıcıya yaz (henüz doğrulanmadı)
    await this.prisma.user.update({
      where: { id: userId },
      data: { phone: normalized, isPhoneVerified: false },
    });

    // Eski tokenları temizle, yenisini oluştur
    await this.prisma.phoneVerificationToken.deleteMany({ where: { userId } });
    const code = this.generateCode();
    const created = await this.prisma.phoneVerificationToken.create({
      data: {
        userId,
        phone: normalized,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + PhoneVerificationService.CODE_TTL_MS),
      },
    });

    const result = await this.netgsm.sendOtp(normalized, code);
    if (!result.success) {
      await this.prisma.phoneVerificationToken.delete({ where: { id: created.id } });
      throw new BadRequestException(result.error || 'SMS gönderilemedi');
    }

    return { message: 'Doğrulama kodu telefonunuza gönderildi' };
  }

  async verify(
    userId: string,
    code: string,
  ): Promise<{ message: string; isPhoneVerified: true }> {
    const token = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('Aktif doğrulama kodu yok. Yeni kod isteyin.');
    }
    if (new Date(token.expiresAt) < new Date()) {
      throw new BadRequestException('Kodun süresi doldu. Yeni kod isteyin.');
    }
    if (token.attempts >= PhoneVerificationService.MAX_ATTEMPTS) {
      throw new BadRequestException('Çok fazla yanlış deneme. Yeni kod isteyin.');
    }

    if (token.codeHash !== this.hash(code)) {
      await this.prisma.phoneVerificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Kod hatalı');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isPhoneVerified: true },
    });
    await this.prisma.phoneVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Telefon numaranız doğrulandı', isPhoneVerified: true };
  }
}
