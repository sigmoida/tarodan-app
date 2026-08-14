import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { ElogoService } from "./elogo.service";
import { i18nMessage } from "../i18n";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";

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
   * Bir SİPARİŞE ait, kullanıcının kendi e-Arşiv faturası (varsa). App'te "Faturayı İndir"
   * butonunu yalnız fatura HAZIRSA (sent/signed) göstermek için. Yoksa null.
   */
  async findOrderInvoiceForUser(orderId: string, userId: string) {
    const sel = {
      id: true,
      invoiceNumber: true,
      type: true,
      total: true,
      issuedAt: true,
      lineDescription: true,
    } as const;
    // 1) Sipariş/üyelik e-Arşivleri. Komisyon ve hizmet bedeli PAKET anahtarlıdır
    //    (satıcı başına tek fatura); platform satışı ve üyelik sipariş anahtarlı.
    //    Siparişin paketi de aranmazsa aynı pakette iki ürün alan alıcı faturasına
    //    hiçbir siparişten ulaşamaz.
    const order = await this.prisma.order
      .findUnique({ where: { id: orderId }, select: { packageId: true } })
      .catch(() => null);
    const sourceIds = order?.packageId ? [orderId, order.packageId] : [orderId];

    let inv = await this.prisma.elogoInvoice.findFirst({
      where: {
        sourceId: { in: sourceIds },
        recipientUserId: userId,
        type: {
          in: ["commission", "service_fee", "platform_sale", "membership"],
        },
        status: { in: ["sent", "signed"] },
      },
      orderBy: { createdAt: "desc" },
      select: sel,
    });
    // 2) BOOST e-Arşivi: sourceId = productBoost.id (order üzerinden boost'u bul).
    if (!inv) {
      const boost = await this.prisma.productBoost
        .findUnique({ where: { orderId }, select: { id: true } })
        .catch(() => null);
      if (boost) {
        inv = await this.prisma.elogoInvoice.findFirst({
          where: {
            sourceId: boost.id,
            recipientUserId: userId,
            type: "boost",
            status: { in: ["sent", "signed"] },
          },
          orderBy: { createdAt: "desc" },
          select: sel,
        });
      }
    }
    if (!inv) return null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      label: inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Fatura",
      total: inv.total,
      issuedAt: inv.issuedAt,
    };
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
