import type { Logger } from "@nestjs/common";
import type { PrismaService } from "../../../prisma";

/**
 * Başarılı müşteri girişini damgalar (`lastLoginAt` + `lastActivityAt`).
 * Şifreli ve sosyal giriş aynı damgayı basar; aksi halde yalnız Google/Apple
 * ile giren hesap sonsuza dek "hiç giriş yapmamış" görünür (admin silme
 * uygunluğu ve raporlar bu alana bakar). Damga oturum vermeyi engellemez:
 * hata yalnız loglanır.
 */
export async function stampUserLogin(
  prisma: PrismaService,
  logger: Logger,
  userId: string,
): Promise<void> {
  const now = new Date();
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: now, lastActivityAt: now },
    });
  } catch (err) {
    logger.warn(`Failed to update lastLoginAt for user ${userId}: ${err}`);
  }
}
