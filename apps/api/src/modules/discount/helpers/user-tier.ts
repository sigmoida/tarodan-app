import { PrismaService } from "../../../prisma";

/**
 * Kullanıcının geçerli üyelik katmanı — üyelik hedefli kupon eşleşmesi için.
 * Aboneliği aktif değilse katman yok sayılır.
 *
 * Kupon doğrulaması ve takas bedeli kampanyası aynı yanıtı vermek zorunda:
 * biri katmanı "aktif olmasa da say" derse üyelik hedefli bir kampanya iki
 * yolda farklı davranır. Bu yüzden sorgu tek yerde duruyor.
 */
export async function resolveUserTier(
  prisma: PrismaService,
  userId: string,
): Promise<string | null> {
  const membership = await prisma.userMembership.findUnique({
    where: { userId },
    select: { status: true, tier: { select: { type: true } } },
  });
  if (!membership || membership.status !== "active") return null;
  return membership.tier?.type ?? null;
}
