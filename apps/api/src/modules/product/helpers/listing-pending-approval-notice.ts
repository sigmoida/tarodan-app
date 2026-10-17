import { ProductStatus } from "@prisma/client";
import type { PrismaService } from "../../../prisma";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../../common/helpers/public-identity";
import type { MailInternalNotifier } from "../../mail-routing/internal/mail-internal-notifier.service";
import { listingPendingApprovalNotice } from "../../mail-routing/helpers/mail-internal-notices";

/**
 * Personel bildirimi (Mail Yönlendirme, `listing.pendingApproval`): ilan
 * moderasyon kuyruğuna girdi. İlanı `pending`e götüren her yol (oluşturma,
 * AI moderasyonunun kuyrukta bıraktığı ilan, düzenleme sonrası yeniden onay,
 * yeniden açma, yenileme) bu TEK fonksiyonu çağırır.
 *
 * İlan gönderim anında HÂLÂ `pending` değilse (AI oto-onayı, admin kararı)
 * bildirim yapılmaz. `occasion` aynı kuyruğa girişi tekilleştirir: oluşturma
 * ve AI işinin ikisi de "submitted" der → tek e-posta.
 *
 * Commit sonrası çağrılır; ASLA fırlatmaz. Test hesabının ilanı bildirilmez.
 */
export async function emitListingPendingApproval(
  prisma: PrismaService,
  notifier: MailInternalNotifier | undefined,
  productId: string,
  occasion: string,
): Promise<void> {
  if (!notifier) return;
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        status: true,
        productCode: true,
        title: true,
        price: true,
        seller: { select: { ...PUBLIC_NAME_SELECT, isTestAccount: true } },
      },
    });
    if (!product || product.status !== ProductStatus.pending) return;
    await notifier.emit(
      "listing.pendingApproval",
      listingPendingApprovalNotice({
        productId,
        productCode: product.productCode,
        title: product.title,
        sellerName: publicName(product.seller),
        price: product.price,
      }),
      {
        isTest: product.seller.isTestAccount,
        dedupeKey: `${productId}:${occasion}`,
      },
    );
  } catch {
    // Personel bildirimi ilan akışını hiçbir koşulda etkilemez.
  }
}
