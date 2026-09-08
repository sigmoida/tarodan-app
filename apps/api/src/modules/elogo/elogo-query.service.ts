import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { ElogoService } from "./elogo.service";
import { i18nMessage } from "../i18n";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";

/**
 * Kullanıcıya gösterim sırası: önce ürün/üyelik gibi ALIŞVERİŞİN kendi belgesi,
 * sonra hizmet bedelleri, en sonda iade belgesi. Listede yer almayan tür sona
 * düşer, aynı rütbedekiler kesim sırasına göre sıralanır.
 */
const INVOICE_DISPLAY_ORDER: readonly string[] = [
  "platform_sale",
  "membership",
  "boost",
  "buyer_commission",
  "buyer_service_fee",
  "buyer_shipping",
  "seller_commission",
  "seller_platform_fee",
  "seller_shipping",
  "commission",
  "service_fee",
  "trade_commission",
  "trade_service_fee",
  "trade_shipping",
  "return_invoice",
];

const invoiceDisplayRank = (type: string): number => {
  const index = INVOICE_DISPLAY_ORDER.indexOf(type);
  return index === -1 ? INVOICE_DISPLAY_ORDER.length : index;
};

/**
 * Faturanın OKUMA yüzeyi — ElogoInvoicingService'ten birebir taşındı. Kesme,
 * gönderme ve ters kayıt hattının hiçbirine dokunmaz: burada yalnız "bu
 * kullanıcının hangi faturaları var ve PDF'ini nasıl indiririm" sorusu yaşar.
 *
 * Sahiplik kontrolü bu servisin işidir ve öyle kalmalı: `userId` verilmeden
 * çağrılan tek yer admin indirme ucudur (orada yetki guard'la çözülür).
 */
@Injectable()
export class ElogoQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  // ───────────────────────── app: görüntüleme/indirme ─────────────────────────

  /** Kullanıcının kendi e-Arşiv faturaları (uygulamada listelemek için). */
  async listForUser(userId: string) {
    const rows = await this.prisma.elogoInvoice.findMany({
      where: { recipientUserId: userId, status: { in: ["sent", "signed"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        invoiceNumber: true,
        documentType: true,
        total: true,
        issuedAt: true,
        status: true,
        sourceId: true,
        ettn: true,
        lineDescription: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      label: r.lineDescription || LINE_DESCRIPTION[r.type] || "Fatura",
      invoiceNumber: r.invoiceNumber,
      documentType: r.documentType,
      total: r.total,
      issuedAt: r.issuedAt,
      sourceId: r.sourceId,
    }));
  }

  /**
   * Bir SİPARİŞE ait, kullanıcının TÜM hazır (sent/signed) e-Arşiv belgeleri.
   *
   * Tek alışverişte taraf başına ÜÇ belge kesilir (komisyon, hizmet bedeli,
   * kargo payı) — "siparişin faturası" artık tekil bir şey değil. Liste
   * `INVOICE_DISPLAY_ORDER` ile sıralanır: ürün/üyelik belgesi başta, ardından
   * hizmet bedelleri, sonra iade belgeleri.
   */
  async listOrderInvoicesForUser(orderId: string, userId: string) {
    const sel = {
      id: true,
      invoiceNumber: true,
      type: true,
      total: true,
      issuedAt: true,
      createdAt: true,
      lineDescription: true,
    } as const;
    // Ücret belgeleri PAKET anahtarlıdır (satıcı başına tek belge); platform
    // satışı ve üyelik sipariş anahtarlı. Siparişin paketi de aranmazsa aynı
    // pakette iki ürün alan alıcı belgelerine hiçbir siparişten ulaşamaz.
    const order = await this.prisma.order
      .findUnique({ where: { id: orderId }, select: { packageId: true } })
      .catch(() => null);
    const sourceIds = order?.packageId ? [orderId, order.packageId] : [orderId];
    // BOOST belgesi sipariş değil, boost kaydı anahtarlıdır.
    const boost = await this.prisma.productBoost
      .findUnique({ where: { orderId }, select: { id: true } })
      .catch(() => null);
    if (boost) sourceIds.push(boost.id);

    const rows = await this.prisma.elogoInvoice.findMany({
      where: {
        sourceId: { in: sourceIds },
        recipientUserId: userId,
        status: { in: ["sent", "signed"] },
      },
      select: sel,
    });

    return rows
      .sort(
        (a, b) =>
          invoiceDisplayRank(a.type) - invoiceDisplayRank(b.type) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.type,
        label: inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Fatura",
        total: inv.total,
        issuedAt: inv.issuedAt,
      }));
  }

  /**
   * Bir SİPARİŞE ait, kullanıcının TEK e-Arşiv belgesi (varsa). Tek belge
   * gösteren eski istemciler (mobil "Faturayı İndir") için korunur; listenin
   * ilkini — yani ürün/üyelik belgesi varsa onu — döndürür. Yeni istemciler
   * `listOrderInvoicesForUser` kullanmalı: bir siparişte artık birden çok belge
   * vardır.
   */
  async findOrderInvoiceForUser(orderId: string, userId: string) {
    const [first] = await this.listOrderInvoicesForUser(orderId, userId);
    return first ?? null;
  }

  /**
   * Kullanıcının bir e-Arşiv faturasının indirme URL'i (S3 presigned, public → app açabilir).
   * PDF S3'te yoksa eLogo'dan canlı çekilip yüklenir + pdfUrl kaydedilir. Sahiplik kontrollü.
   * Storage yoksa son çare: buffer döner (controller stream eder).
   */
  async getInvoiceDownload(
    invoiceId: string,
    userId?: string,
  ): Promise<{ url?: string; buffer?: Buffer; invoiceNumber: string }> {
    // userId verilmişse sahiplik kontrollü (kullanıcı ucu); verilmemişse admin (tüm faturalar).
    const inv = await this.prisma.elogoInvoice.findFirst({
      where: userId
        ? { id: invoiceId, recipientUserId: userId }
        : { id: invoiceId },
      select: { id: true, ettn: true, invoiceNumber: true, pdfUrl: true },
    });
    if (!inv?.ettn || !inv.invoiceNumber)
      throw new NotFoundException(
        i18nMessage("server.elogo.archiveInvoiceNotFound"),
      );

    let key = inv.pdfUrl;
    const storageOk = !!this.storage?.isStorageAvailable?.();

    // S3'te yoksa canlı çek → yükle → kaydet.
    if (!key && storageOk) {
      const pdf = await this.elogo
        .getEArchiveInvoicePdf(inv.ettn)
        .catch(() => null);
      if (pdf && pdf.length > 200) {
        try {
          const up = await this.storage!.uploadFile(pdf, {
            bucket: "documents",
            folder: "elogo-invoices",
            filename: `${inv.invoiceNumber}.pdf`,
            mimeType: "application/pdf",
            isPublic: false,
            entityType: "elogo_invoice",
            entityId: inv.id,
          } as any);
          key = up.key;
          await this.prisma.elogoInvoice
            .update({ where: { id: inv.id }, data: { pdfUrl: key } })
            .catch(() => undefined);
        } catch {
          return { buffer: pdf, invoiceNumber: inv.invoiceNumber }; // S3 olmazsa stream
        }
      }
    }

    if (key && storageOk) {
      const url = await this.storage!.getPresignedDownloadUrl(
        "documents",
        key,
        3600,
      ).catch(() => null);
      if (url) return { url, invoiceNumber: inv.invoiceNumber };
    }
    // Son çare: canlı buffer (storage yok).
    const buffer = await this.elogo
      .getEArchiveInvoicePdf(inv.ettn)
      .catch(() => null);
    if (!buffer)
      throw new NotFoundException(
        i18nMessage("server.elogo.invoicePdfUnavailable"),
      );
    return { buffer, invoiceNumber: inv.invoiceNumber };
  }
}
