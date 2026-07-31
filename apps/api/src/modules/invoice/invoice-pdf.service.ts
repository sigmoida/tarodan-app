/**
 * Invoice PDF / HTML rendering engine (InvoicePdfService)
 *
 * InvoiceService'ten çıkarılan render motoru: fatura numarası üretimi, PDF
 * (pdfkit) ve HTML fatura üretimi, S3 anahtarı -> presigned URL çözümü ve
 * Türkçe uyumlu Unicode font seçimi. Facade (InvoiceService) bu servise
 * delege eder. Üretilen PDF/HTML çıktısı birebir korunur.
 *
 * Turkish character support via system font fallbacks or embedded fonts.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import * as PDFDocument from "pdfkit";

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;

  // Seller info
  seller: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    taxId?: string;
  };

  // Buyer info
  buyer: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    taxId?: string;
  };

  // Order info
  orderId: string;
  orderNumber: string;

  // Line items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;

  // Totals
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  shippingCost: number;
  commission: number;
  total: number;

  // Payment info
  paymentMethod: string;
  paymentDate?: Date;

  // Currency
  currency: string;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);
  private readonly companyInfo = {
    name: "Tarodan Marketplace",
    address: "İstanbul, Türkiye",
    taxId: "0000000000",
    email: "info@tarodan.com.tr",
    phone: "+90 212 000 0000",
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Resolve a Turkish-capable Unicode TrueType font for the invoice PDF.
   *
   * The standard PDF font (Helvetica) only covers Latin-1 and mangles İ/ı/ş/ğ — which is why
   * invoices looked like garbled "dummy" PDFs. We bundle DejaVu Sans (full Turkish coverage,
   * freely redistributable) so rendering is correct on EVERY platform, including the
   * node:alpine container which ships no system fonts at all.
   *
   * Priority: bundled DejaVu → INVOICE_FONT_PATH env → platform system fonts → null (Helvetica).
   * @param weight 'regular' | 'bold'
   */
  private getInvoiceFontPath(
    weight: "regular" | "bold" = "regular",
  ): string | null {
    const bundledName =
      weight === "bold" ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf";
    // Cover both dev and built layouts (code runs from dist/src/..., assets land under dist/...).
    const bundledCandidates = [
      path.join(__dirname, "../assets/fonts", bundledName),
      path.join(__dirname, "../../assets/fonts", bundledName),
      path.join(__dirname, "../../../assets/fonts", bundledName),
      path.join(__dirname, "../../../../assets/fonts", bundledName),
      path.join(process.cwd(), "dist/src/assets/fonts", bundledName),
      path.join(process.cwd(), "dist/assets/fonts", bundledName),
      path.join(process.cwd(), "src/assets/fonts", bundledName),
      path.join(process.cwd(), "assets/fonts", bundledName),
    ];
    for (const p of bundledCandidates) {
      if (fs.existsSync(p)) return p;
    }

    // Optional explicit override (regular weight).
    const envPath = this.configService.get("INVOICE_FONT_PATH");
    if (
      weight === "regular" &&
      envPath &&
      typeof envPath === "string" &&
      fs.existsSync(envPath)
    )
      return envPath;

    // System font fallbacks (Arial & DejaVu both support Turkish).
    const platform = process.platform;
    const candidates: string[] = [];
    if (platform === "win32") {
      candidates.push(
        weight === "bold"
          ? "C:\\Windows\\Fonts\\arialbd.ttf"
          : "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
      );
    } else if (platform === "darwin") {
      candidates.push(
        weight === "bold"
          ? "/Library/Fonts/Arial Bold.ttf"
          : "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
      );
    } else {
      candidates.push(
        weight === "bold"
          ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
          : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/arial.ttf",
        "/usr/share/fonts/TTF/Arial.ttf",
      );
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Resolve invoice pdfUrl - if it's an S3 key, generate presigned URL
   * If it's already an http(s) URL, return as-is
   */
  async resolveInvoicePdfUrl(
    pdfUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!pdfUrl) return null;
    // Already a full URL - return as-is
    if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://"))
      return pdfUrl;
    // S3 key - resolve to presigned URL
    try {
      return await this.storageService.getPresignedDownloadUrl(
        "documents",
        pdfUrl,
        3600 * 24,
      ); // 24 hours
    } catch (e: any) {
      this.logger.warn(
        `Failed to resolve invoice PDF presigned URL for key: ${pdfUrl} - ${e.message}`,
      );
      return null;
    }
  }

  /**
   * Aylık sıralı belge numarası: SPR-YYYYMM-NNNNNN.
   *
   * Sayaç `document_sequences` üzerinde upsert + increment ile ATOMİK alınır;
   * "o ayın en büyük numarasını oku +1 yaz" yaklaşımı eşzamanlı iki faturada
   * aynı numarayı üretip unique index'e takılıyordu.
   */
  async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const scope = `SPR-${period}`;

    const row = await this.prisma.documentSequence.upsert({
      where: { scope },
      create: { scope, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });

    return `${scope}-${String(row.lastValue).padStart(6, "0")}`;
  }

  /**
   * Generate HTML invoice content
   */
  generateInvoiceHtml(data: InvoiceData): string {
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: data.currency,
      }).format(amount);

    const formatDate = (date: Date) =>
      new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(date);

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sipariş Özeti ${data.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; background: #f5f5f5; }
    .invoice { max-width: 800px; margin: 20px auto; background: white; padding: 40px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e63946; }
    .logo { font-size: 28px; font-weight: bold; color: #e63946; }
    .logo span { color: #1d3557; }
    .invoice-info { text-align: right; }
    .invoice-info h1 { font-size: 24px; color: #1d3557; margin-bottom: 5px; }
    .invoice-info .invoice-number { font-size: 16px; color: #666; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party h3 { font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 10px; letter-spacing: 1px; }
    .party p { margin-bottom: 5px; }
    .party .name { font-size: 16px; font-weight: bold; color: #1d3557; }
    .details { margin-bottom: 30px; }
    .details table { width: 100%; border-collapse: collapse; }
    .details th { background: #1d3557; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .details td { padding: 12px; border-bottom: 1px solid #eee; }
    .details tr:hover { background: #f9f9f9; }
    .details .amount { text-align: right; }
    .totals { display: flex; justify-content: flex-end; margin-top: 20px; }
    .totals table { width: 300px; }
    .totals td { padding: 8px 0; }
    .totals td:last-child { text-align: right; font-weight: bold; }
    .totals .total-row { border-top: 2px solid #1d3557; font-size: 18px; color: #1d3557; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    .payment-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .payment-info h4 { color: #1d3557; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 4px 8px; background: #28a745; color: white; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">Taro<span>dan</span></div>
      <div class="invoice-info">
        <h1>SİPARİŞ ÖZETİ</h1>
        <div class="invoice-number">${data.invoiceNumber}</div>
        <p style="margin-top: 10px;">Tarih: ${formatDate(data.invoiceDate)}</p>
        <p>Sipariş No: ${data.orderNumber}</p>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Satıcı</h3>
        <p class="name">${data.seller.name}</p>
        <p>${data.seller.email}</p>
        ${data.seller.phone ? `<p>${data.seller.phone}</p>` : ""}
        ${data.seller.address ? `<p>${data.seller.address}</p>` : ""}
        ${data.seller.taxId ? `<p>Vergi No: ${data.seller.taxId}</p>` : ""}
      </div>
      <div class="party">
        <h3>Alıcı</h3>
        <p class="name">${data.buyer.name}</p>
        <p>${data.buyer.email}</p>
        ${data.buyer.phone ? `<p>${data.buyer.phone}</p>` : ""}
        ${data.buyer.address ? `<p>${data.buyer.address}</p>` : ""}
        ${data.buyer.taxId ? `<p>Vergi No: ${data.buyer.taxId}</p>` : ""}
      </div>
    </div>

    <div class="details">
      <table>
        <thead>
          <tr>
            <th>Açıklama</th>
            <th style="width: 80px; text-align: center;">Adet</th>
            <th style="width: 120px; text-align: right;">Birim Fiyat</th>
            <th style="width: 120px; text-align: right;">Toplam</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item) => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.quantity}</td>
              <td class="amount">${formatCurrency(item.unitPrice)}</td>
              <td class="amount">${formatCurrency(item.total)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <table>
        <tr>
          <td>Ara Toplam:</td>
          <td>${formatCurrency(data.subtotal)}</td>
        </tr>
        ${
          data.shippingCost > 0
            ? `
          <tr>
            <td>Kargo:</td>
            <td>${formatCurrency(data.shippingCost)}</td>
          </tr>
        `
            : ""
        }
        ${
          data.commission > 0
            ? `
          <tr>
            <td>Platform ücreti:</td>
            <td>${formatCurrency(data.commission)}</td>
          </tr>
        `
            : ""
        }
        ${
          data.taxAmount > 0
            ? `
          <tr>
            <td>KDV (%${data.taxRate}):</td>
            <td>${formatCurrency(data.taxAmount)}</td>
          </tr>
        `
            : ""
        }
        <tr class="total-row">
          <td>Genel Toplam:</td>
          <td>${formatCurrency(data.total)}</td>
        </tr>
      </table>
    </div>

    <div class="payment-info">
      <h4>Ödeme Bilgileri</h4>
      <p>Ödeme Yöntemi: ${data.paymentMethod}</p>
      ${data.paymentDate ? `<p>Ödeme Tarihi: ${formatDate(data.paymentDate)}</p>` : ""}
      <p style="margin-top: 10px;"><span class="badge">✓ Ödendi</span></p>
    </div>

    <div class="footer">
      <p><strong>${this.companyInfo.name}</strong></p>
      <p>${this.companyInfo.address} | ${this.companyInfo.email} | ${this.companyInfo.phone}</p>
      <p style="margin-top: 10px;">Bu belge bilgilendirme amaçlı sipariş özetidir; mali belge (fatura) niteliği taşımaz.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Internal PDF generator using pdfkit
   */
  async generatePdfFromData(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const buffers: Buffer[] = [];

        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", (err) => reject(err));

        // Register a Unicode TrueType font so Turkish characters (İ, ı, ş, ğ, ç, ö, ü) render correctly.
        // Without this, PDFKit's default Helvetica (Latin-1 only) mangles İ/ı/ş/ğ — the cause of the
        // garbled, "dummy"-looking invoices. Bundled DejaVu Sans works on every platform.
        const regularPath = this.getInvoiceFontPath("regular");
        const boldPath = this.getInvoiceFontPath("bold");
        let fontRegular = "Helvetica";
        let fontBold = "Helvetica-Bold";
        if (regularPath) {
          try {
            doc.registerFont("body", regularPath);
            doc.registerFont("body-bold", boldPath || regularPath);
            fontRegular = "body";
            fontBold = "body-bold";
          } catch (e: any) {
            this.logger.warn(
              `Failed to register invoice font (${regularPath}): ${e?.message}. Falling back to Helvetica.`,
            );
          }
        } else {
          this.logger.warn(
            "No Unicode invoice font found — Turkish characters may not render. Bundle DejaVu Sans or set INVOICE_FONT_PATH.",
          );
        }
        doc.font(fontRegular);

        // Header
        doc
          .font(fontBold)
          .fillColor("#1d3557")
          .fontSize(24)
          .text("TARODAN", { align: "left" });
        doc
          .font(fontRegular)
          .fontSize(10)
          .fillColor("#666666")
          .text("İkinci El Model Araba Pazarı", { align: "left" });

        doc.moveDown();
        doc
          .font(fontBold)
          .fillColor("#000000")
          .fontSize(20)
          .text("SİPARİŞ ÖZETİ", { align: "right" });
        doc
          .font(fontRegular)
          .fontSize(10)
          .text(`Belge No: ${data.invoiceNumber}`, { align: "right" });
        doc.text(`Tarih: ${data.invoiceDate.toLocaleDateString("tr-TR")}`, {
          align: "right",
        });

        doc.moveDown();
        const yBeforeInfo = doc.y;

        // Seller Block
        doc
          .font(fontBold)
          .fontSize(12)
          .fillColor("#1d3557")
          .text("SATICI BİLGİLERİ", 50, yBeforeInfo);
        doc.font(fontRegular).fontSize(10).fillColor("#333333");
        doc.text(data.seller.name);
        doc.text(data.seller.email);
        if (data.seller.taxId) doc.text(`Vergi No: ${data.seller.taxId}`);
        if (data.seller.address) doc.text(data.seller.address, { width: 200 });

        // Buyer Block
        doc
          .font(fontBold)
          .fontSize(12)
          .fillColor("#1d3557")
          .text("ALICI BİLGİLERİ", 300, yBeforeInfo);
        doc.font(fontRegular).fontSize(10).fillColor("#333333");
        doc.text(data.buyer.name, 300);
        doc.text(data.buyer.email, 300);
        if (data.buyer.address)
          doc.text(data.buyer.address, 300, doc.y, { width: 200 });

        doc.moveDown(4);

        // Table Header
        const tableTop = doc.y;
        doc.rect(50, tableTop, 500, 20).fill("#f8f9fa");
        doc.font(fontBold).fillColor("#1d3557").fontSize(10);
        doc.text("Açıklama", 60, tableTop + 6);
        doc.text("Adet", 350, tableTop + 6, { width: 50, align: "center" });
        doc.text("Birim Fiyat", 400, tableTop + 6, {
          width: 70,
          align: "right",
        });
        doc.text("Toplam", 480, tableTop + 6, { width: 60, align: "right" });

        // Table Items
        let currentY = tableTop + 25;
        doc.font(fontRegular);
        data.items.forEach((item) => {
          doc.fillColor("#333333");
          doc.text(item.description, 60, currentY, { width: 280 });
          doc.text(item.quantity.toString(), 350, currentY, {
            width: 50,
            align: "center",
          });
          doc.text(
            `${item.unitPrice.toLocaleString("tr-TR")} TL`,
            400,
            currentY,
            { width: 70, align: "right" },
          );
          doc.text(`${item.total.toLocaleString("tr-TR")} TL`, 480, currentY, {
            width: 60,
            align: "right",
          });
          currentY += 20;
        });

        // Totals
        const totalGap = 15;
        currentY += 20;
        doc.fontSize(10).fillColor("#666666");

        doc.text("Ara Toplam:", 380, currentY, { width: 100, align: "right" });
        doc.text(`${data.subtotal.toLocaleString("tr-TR")} TL`, 480, currentY, {
          width: 60,
          align: "right",
        });

        currentY += totalGap;
        doc.text(`KDV (%${data.taxRate}):`, 380, currentY, {
          width: 100,
          align: "right",
        });
        doc.text(
          `${data.taxAmount.toLocaleString("tr-TR")} TL`,
          480,
          currentY,
          { width: 60, align: "right" },
        );

        if (data.shippingCost > 0) {
          currentY += totalGap;
          doc.text("Kargo Ücreti:", 380, currentY, {
            width: 100,
            align: "right",
          });
          doc.text(
            `${data.shippingCost.toLocaleString("tr-TR")} TL`,
            480,
            currentY,
            { width: 60, align: "right" },
          );
        }
        if (data.commission > 0) {
          currentY += totalGap;
          doc.text("Platform ücreti:", 380, currentY, {
            width: 100,
            align: "right",
          });
          doc.text(
            `${data.commission.toLocaleString("tr-TR")} TL`,
            480,
            currentY,
            { width: 60, align: "right" },
          );
        }

        currentY += 25;
        doc
          .font(fontBold)
          .fontSize(14)
          .fillColor("#1d3557")
          .text("GENEL TOPLAM:", 300, currentY, { width: 180, align: "right" });
        doc.text(`${data.total.toLocaleString("tr-TR")} TL`, 480, currentY, {
          width: 60,
          align: "right",
        });

        // Footer
        const footerY = 750;
        doc.font(fontRegular).fontSize(8).fillColor("#999999");
        doc.text(
          "Bu belge bilgilendirme amaçlı sipariş özetidir; mali belge (fatura) niteliği taşımaz.",
          50,
          footerY,
          { align: "center", width: 500 },
        );
        doc.text(
          "Tarodan - Model Araba Alım Satım ve Takas Platformu",
          50,
          footerY + 12,
          { align: "center", width: 500 },
        );
        doc.text("https://tarodan.com", 50, footerY + 24, {
          align: "center",
          width: 500,
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert HTML to PDF buffer (Legacy - kept for compatibility, uses generatePdfFromData internally if possible)
   */
  private async htmlToPdf(html: string): Promise<Buffer> {
    // This is now redundant but kept to avoid breaking types if any external calls exist
    return Buffer.from(html, "utf-8");
  }
}
