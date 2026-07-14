import { Injectable, Logger, Optional, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma';
import { ElogoService } from './elogo.service';
import { TaxService } from '../tax/tax.service';
import { StorageService } from '../storage/storage.service';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { buildInvoiceXml, type UblParty } from './ubl/ubl-invoice.builder';
import type { ElogoDocumentType } from './elogo.types';
import {
  renderEmailTemplate,
  substituteEmailVariables,
  getEmailTemplateSubject,
} from '../../common/helpers/email-template-renderer';

/**
 * Tarodan'ın KENDİ gelir e-belgelerini (komisyon, hizmet bedeli, üyelik, boost, iade)
 * eLogo'ya keser. Düzenleyen HEP platform firması (Serhatlar) — satıcı adına DEĞİL.
 *
 * İlkeler:
 *  - Tutarlar olay anındaki KAYITLI snapshot'tan gelir (CommissionLedger / MembershipPayment /
 *    ProductBoost). Oran/fiyat sonradan değişse bile kesilen fatura etkilenmez.
 *  - Idempotent: (type, sourceId) tekil; aynı kaynak iki kez kesilmez.
 *  - Non-blocking: hata ödeme/sipariş akışını ETKİLEMEZ; failed kayıt + retry cron.
 *  - Numara gap-free (ElogoDocSequence); retry aynı numara/ETTN'i yeniden kullanır.
 */
type RevenueType = 'commission' | 'service_fee' | 'membership' | 'boost' | 'trade_commission' | 'platform_sale';

const LINE_DESCRIPTION: Record<string, string> = {
  commission: 'Aracılık hizmet (komisyon) bedeli',
  service_fee: 'Hizmet bedeli',
  membership: 'Üyelik / abonelik bedeli',
  boost: 'İlan öne çıkarma (boost) bedeli',
  trade_commission: 'Takas aracılık hizmet (komisyon) bedeli',
  platform_sale: 'Ürün/hizmet bedeli',
  return_invoice: 'İade faturası',
};

@Injectable()
export class ElogoInvoicingService {
  private readonly logger = new Logger(ElogoInvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly config: ConfigService,
    @Optional() private readonly taxService?: TaxService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
  ) {}

  // ───────────────────────── config ─────────────────────────
  private cfg(key: string, def = ''): string {
    return (this.config.get<string>(key) ?? def).trim();
  }
  private get vatRate(): number {
    return Number(this.cfg('ELOGO_VAT_RATE', '20')) || 20;
  }
  /**
   * Kesim anındaki KDV oranı: önce admin'in vergi config'i (TaxRegion/TaxRate, TR
   * varsayılan kuralı), yoksa ELOGO_VAT_RATE env (varsayılan 20). Kayıt snapshot'ı
   * (ElogoInvoice.vatRate) sonraki retry/iade adımlarında aynen kullanılır.
   */
  private async resolveVatRate(): Promise<number> {
    try {
      const resolved = await this.taxService?.resolveTaxRate('TR');
      if (resolved && resolved.rate > 0) return resolved.rate;
    } catch {
      // config çözülemedi — env fallback
    }
    return this.vatRate;
  }
  private get prefix(): string {
    return this.cfg('ELOGO_INVOICE_PREFIX', 'TRD');
  }
  private get xsltUuid(): string | undefined {
    return this.cfg('ELOGO_INVOICE_XSLT_UUID') || undefined;
  }
  /** Saklanan tutarlar KDV dahil mi (gross)? Varsayılan: evet (tüketici fiyatları KDV dahildir). */
  private get amountsIncludeVat(): boolean {
    return this.cfg('ELOGO_AMOUNTS_INCLUDE_VAT', 'true').toLowerCase() !== 'false';
  }

  private supplierParty(): UblParty {
    return {
      vknTckn: this.cfg('ELOGO_COMPANY_VKN', this.cfg('ELOGO_WS_USERNAME', '')),
      title: this.cfg('ELOGO_COMPANY_TITLE', 'TARODAN'),
      taxOffice: this.cfg('ELOGO_COMPANY_TAXOFFICE') || undefined,
      city: this.cfg('ELOGO_COMPANY_CITY') || undefined,
      district: this.cfg('ELOGO_COMPANY_DISTRICT') || undefined,
      streetAddress: this.cfg('ELOGO_COMPANY_ADDRESS') || undefined,
      email: this.cfg('ELOGO_COMPANY_EMAIL') || undefined,
    };
  }

  // ───────────────────────── helpers ─────────────────────────
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  /** Saklanan tutar → KDV hariç matrah. amountsIncludeVat=false ise tutar zaten matrahtır. */
  private toNet(amount: number, vatRate: number): number {
    return this.amountsIncludeVat ? this.round2(amount / (1 + vatRate / 100)) : this.round2(amount);
  }
  private ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  private hms(d: Date): string {
    return d.toTimeString().slice(0, 8);
  }

  /** Gap-free belge numarası: PREFIX + yıl + 9 hane (ElogoDocSequence atomik artırım). */
  private async allocateInvoiceNumber(year: number): Promise<string> {
    const prefix = this.prefix;
    const last = await this.prisma.$transaction(async (tx) => {
      const row = await tx.elogoDocSequence.upsert({
        where: { prefix_year: { prefix, year } },
        create: { prefix, year, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      });
      return row.lastValue;
    });
    return `${prefix}${year}${String(last).padStart(9, '0')}`;
  }

  /** Alıcı (User) → UBL party + belge tipi (e-Fatura mükellefse EINVOICE). */
  private async resolveRecipient(userId: string): Promise<{
    vknTckn: string;
    name: string;
    party: UblParty;
    documentType: ElogoDocumentType;
    alias?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, companyName: true, taxId: true, email: true },
    });
    const digits = (user?.taxId || '').replace(/\D/g, '');
    const hasRealTaxId = digits.length === 10 || digits.length === 11;
    const vknTckn = hasRealTaxId ? digits : '11111111111'; // bilinmeyen nihai tüketici (GİB)
    const name = user?.companyName || user?.displayName || 'Müşteri';

    let documentType: ElogoDocumentType = 'EARCHIVE';
    let alias: string | undefined;
    if (hasRealTaxId) {
      const chk = await this.elogo.checkUser(vknTckn).catch(() => null);
      if (chk?.isEInvoiceUser) {
        documentType = 'EINVOICE';
        alias = chk.eInvoicePkAlias;
      }
    }
    return { vknTckn, name, party: this.buildParty(vknTckn, name, user?.email), documentType, alias };
  }

  private buildParty(
    vknTckn: string,
    name: string,
    email?: string | null,
    addr?: { city?: string | null; district?: string | null; address?: string | null } | null,
  ): UblParty {
    // GİB UBL-TR: PostalAddress'te CitySubdivisionName + CityName gerekli (yalnız Country → şema hatası).
    const common = {
      vknTckn,
      email: email || undefined,
      city: addr?.city || 'Belirtilmemiş',
      district: addr?.district || 'Belirtilmemiş',
      streetAddress: addr?.address || undefined,
    };
    if (vknTckn.length === 10) {
      return { ...common, title: name };
    }
    // GİB gerçek kişi: cac:Person/cbc:FirstName VE cbc:FamilyName ikisi de zorunlu.
    // Biri boş kalırsa eLogo "ad-soyad bulunmalıdır" ile reddeder; bu yüzden asla boş bırakma.
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const lastName = parts.pop()!;
      return { ...common, firstName: parts.join(' '), lastName };
    }
    const single = parts[0];
    return single
      ? { ...common, firstName: single, lastName: single }
      : { ...common, firstName: 'Nihai', lastName: 'Tüketici' };
  }

  /** Alıcının varsayılan adresini çek (UBL PostalAddress için). */
  private async fetchAddress(
    userId?: string | null,
  ): Promise<{ city: string | null; district: string | null; address: string | null } | null> {
    if (!userId) return null;
    return this.prisma.address
      .findFirst({
        where: { userId },
        orderBy: { isDefault: 'desc' },
        select: { city: true, district: true, address: true },
      })
      .catch(() => null);
  }

  // ───────────────────────── public API (tetikleyiciler çağırır) ─────────────────────────

  /** Komisyon faturası → SATICIYA (ledger.sellerCommission). Sipariş "earned" olunca. */
  async issueCommissionInvoice(orderId: string): Promise<void> {
    const [order, ledger] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId }, select: { sellerId: true } }),
      this.prisma.commissionLedger.findUnique({
        where: { orderId },
        select: { sellerCommission: true, refundedSellerCommission: true },
      }),
    ]);
    if (!order || !ledger) return;
    // Platform kendi ürününü satıyorsa komisyon = kendine kesilemez → atla (yerine platform_sale).
    if (await this.isPlatformSeller(order.sellerId)) return;
    // #88: NET komisyon faturalanır (kısmi iade edilen kısım düşülür). İade yoksa
    // refunded=0 → net=original (davranış aynı). Net ≤ 0 ise faturalanacak bir şey yok.
    const netCommission =
      Number(ledger.sellerCommission) - Number(ledger.refundedSellerCommission);
    if (netCommission <= 0) return;
    await this.cut('commission', orderId, order.sellerId, netCommission);
  }

  /**
   * Platform (Tarodan Official Store) KENDİ ürününü sattığında → ALICIYA ürün e-Arşivi.
   * Tarodan satıcıdır; tam ürün tutarı (order.totalAmount) faturalanır. Yalnız platform satışında.
   */
  async issuePlatformSaleInvoice(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, buyerId: true, totalAmount: true },
    });
    if (!order) return;
    if (!(await this.isPlatformSeller(order.sellerId))) return;
    await this.cut('platform_sale', orderId, order.buyerId, Number(order.totalAmount));
  }

  private async isPlatformSeller(sellerId: string): Promise<boolean> {
    const u = await this.prisma.user
      .findUnique({ where: { id: sellerId }, select: { sellerType: true } })
      .catch(() => null);
    return u?.sellerType === 'platform';
  }

  /** Hizmet bedeli faturası → ALICIYA (ledger.buyerFee). Yalnız buyerFee > 0 ise. */
  async issueServiceFeeInvoice(orderId: string): Promise<void> {
    const [order, ledger] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, sellerId: true } }),
      this.prisma.commissionLedger.findUnique({
        where: { orderId },
        select: { buyerFee: true, refundedBuyerFee: true },
      }),
    ]);
    if (!order || !ledger) return;
    // Platform (Tarodan) KENDİ ürününü satıyorsa hizmet bedeli AYRI kesilmez — platform_sale faturası
    // zaten tam tutarı (buyer fee dahil) içerir. Aksi halde buyer fee çift faturalanır.
    if (await this.isPlatformSeller(order.sellerId)) return;
    // #88: NET hizmet bedeli (kısmi iade düşülür). İade yoksa net=original.
    const netBuyerFee =
      Number(ledger.buyerFee) - Number(ledger.refundedBuyerFee);
    if (netBuyerFee <= 0) return;
    await this.cut('service_fee', orderId, order.buyerId, netBuyerFee);
  }

  /** Üyelik faturası → ÜYEYE (membershipPayment.amount). */
  async issueMembershipInvoice(membershipPaymentId: string): Promise<void> {
    const mp = await this.prisma.membershipPayment.findUnique({
      where: { id: membershipPaymentId },
      select: { amount: true, membership: { select: { userId: true } } },
    });
    if (!mp?.membership) return;
    await this.cut('membership', membershipPaymentId, mp.membership.userId, Number(mp.amount));
  }

  /**
   * Üyelik faturası → MEM- SİPARİŞTEN (membershipPayment kaydı oluşmuyor; üyelik alımı
   * yalnız MEM- order + tier upgrade yapıyor). Alıcıya, order.totalAmount üzerinden. sourceId=orderId.
   */
  async issueMembershipInvoiceForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, totalAmount: true, productId: true },
    });
    if (!order || !order.productId?.startsWith('membership-')) return;
    await this.cut('membership', orderId, order.buyerId, Number(order.totalAmount));
  }

  /** Boost faturası → SATICIYA (boost.price). */
  async issueBoostInvoice(boostId: string): Promise<void> {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: boostId },
      select: { userId: true, price: true },
    });
    if (!boost) return;
    await this.cut('boost', boostId, boost.userId, Number(boost.price));
  }

  /** Takas nakit komisyon faturası → ÖDEYENE (TradeCashPayment.commission; payer taşır). */
  async issueTradeCashCommissionInvoice(tradeCashPaymentId: string): Promise<void> {
    const tcp = await this.prisma.tradeCashPayment.findUnique({
      where: { id: tradeCashPaymentId },
      select: { payerId: true, commission: true },
    });
    if (!tcp) return;
    await this.cut('trade_commission', tradeCashPaymentId, tcp.payerId, Number(tcp.commission));
  }

  /** İade: bu siparişe ait TÜM Tarodan faturalarını (komisyon/hizmet/boost/üyelik) iptal/iade et. */
  async handleOrderRefund(orderId: string): Promise<void> {
    if (!this.elogo.isEnabled()) return;
    await this.reverseByKeys(await this.relatedInvoiceKeys(orderId));
  }

  /** İade: takas nakit komisyon faturasını iptal/iade et. */
  async handleTradeCashRefund(tradeCashPaymentId: string): Promise<void> {
    if (!this.elogo.isEnabled()) return;
    await this.reverseByKeys([{ type: 'trade_commission', sourceId: tradeCashPaymentId }]);
  }

  /** Bir siparişe bağlı tüm gelir faturası anahtarları (orderId / boostId / membershipPaymentId). */
  private async relatedInvoiceKeys(orderId: string): Promise<Array<{ type: string; sourceId: string }>> {
    const keys: Array<{ type: string; sourceId: string }> = [
      { type: 'commission', sourceId: orderId },
      { type: 'service_fee', sourceId: orderId },
      { type: 'platform_sale', sourceId: orderId },
    ];
    const boost = await this.prisma.productBoost
      .findUnique({ where: { orderId }, select: { id: true } })
      .catch(() => null);
    if (boost) keys.push({ type: 'boost', sourceId: boost.id });
    const pay = await this.prisma.payment
      .findFirst({ where: { orderId }, select: { providerPaymentId: true }, orderBy: { createdAt: 'desc' } })
      .catch(() => null);
    if (pay?.providerPaymentId) {
      const mp = await this.prisma.membershipPayment
        .findFirst({ where: { providerPaymentId: pay.providerPaymentId }, select: { id: true } })
        .catch(() => null);
      if (mp) keys.push({ type: 'membership', sourceId: mp.id });
    }
    return keys;
  }

  private async reverseByKeys(keys: Array<{ type: string; sourceId: string }>): Promise<void> {
    for (const k of keys) {
      const inv = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type: k.type as any, sourceId: k.sourceId } },
      });
      if (inv && (inv.status === 'sent' || inv.status === 'signed')) {
        await this.reverseInvoice(inv).catch((e) =>
          this.logger.error(`eLogo iade/iptal hata (${inv.invoiceNumber}): ${e?.message}`),
        );
      }
    }
  }

  /** Cron: pending/failed kayıtları yeniden dener (aynı numara/ETTN). */
  async retryPendingInvoices(maxAttempts = 8, batch = 50): Promise<void> {
    if (!this.elogo.isEnabled()) return;
    const pend = await this.prisma.elogoInvoice.findMany({
      where: { status: { in: ['pending', 'failed'] }, attemptCount: { lt: maxAttempts } },
      take: batch,
      orderBy: { createdAt: 'asc' },
    });
    for (const inv of pend) {
      await this.sendRecord(inv).catch((e) =>
        this.logger.error(`eLogo retry hata (${inv.invoiceNumber}): ${e?.message}`),
      );
    }
  }

  // ───────────────────────── app: görüntüleme/indirme ─────────────────────────

  /** Kullanıcının kendi e-Arşiv faturaları (uygulamada listelemek için). */
  async listForUser(userId: string) {
    const rows = await this.prisma.elogoInvoice.findMany({
      where: { recipientUserId: userId, status: { in: ['sent', 'signed'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, type: true, invoiceNumber: true, documentType: true,
        total: true, issuedAt: true, status: true, sourceId: true, ettn: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      label: LINE_DESCRIPTION[r.type] || 'Fatura',
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
    const sel = { id: true, invoiceNumber: true, type: true, total: true, issuedAt: true } as const;
    // 1) Sipariş/üyelik e-Arşivleri: sourceId = orderId (komisyon/hizmet/platform satış/üyelik).
    //    (Üyelik alımı MEM- order üzerinden kesilir; sourceId=orderId.)
    let inv = await this.prisma.elogoInvoice.findFirst({
      where: {
        sourceId: orderId,
        recipientUserId: userId,
        type: { in: ['commission', 'service_fee', 'platform_sale', 'membership'] },
        status: { in: ['sent', 'signed'] },
      },
      orderBy: { createdAt: 'desc' },
      select: sel,
    });
    // 2) BOOST e-Arşivi: sourceId = productBoost.id (order üzerinden boost'u bul).
    if (!inv) {
      const boost = await this.prisma.productBoost
        .findUnique({ where: { orderId }, select: { id: true } })
        .catch(() => null);
      if (boost) {
        inv = await this.prisma.elogoInvoice.findFirst({
          where: { sourceId: boost.id, recipientUserId: userId, type: 'boost', status: { in: ['sent', 'signed'] } },
          orderBy: { createdAt: 'desc' },
          select: sel,
        });
      }
    }
    if (!inv) return null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      label: LINE_DESCRIPTION[inv.type] || 'Fatura',
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
      where: userId ? { id: invoiceId, recipientUserId: userId } : { id: invoiceId },
      select: { id: true, ettn: true, invoiceNumber: true, pdfUrl: true },
    });
    if (!inv?.ettn || !inv.invoiceNumber) throw new NotFoundException('e-Arşiv faturası bulunamadı');

    let key = inv.pdfUrl;
    const storageOk = !!this.storage?.isStorageAvailable?.();

    // S3'te yoksa canlı çek → yükle → kaydet.
    if (!key && storageOk) {
      const pdf = await this.elogo.getEArchiveInvoicePdf(inv.ettn).catch(() => null);
      if (pdf && pdf.length > 200) {
        try {
          const up = await this.storage!.uploadFile(pdf, {
            bucket: 'documents',
            folder: 'elogo-invoices',
            filename: `${inv.invoiceNumber}.pdf`,
            mimeType: 'application/pdf',
            isPublic: false,
            entityType: 'elogo_invoice',
            entityId: inv.id,
          } as any);
          key = up.key;
          await this.prisma.elogoInvoice.update({ where: { id: inv.id }, data: { pdfUrl: key } }).catch(() => undefined);
        } catch {
          return { buffer: pdf, invoiceNumber: inv.invoiceNumber }; // S3 olmazsa stream
        }
      }
    }

    if (key && storageOk) {
      const url = await this.storage!.getPresignedDownloadUrl('documents', key, 3600).catch(() => null);
      if (url) return { url, invoiceNumber: inv.invoiceNumber };
    }
    // Son çare: canlı buffer (storage yok).
    const buffer = await this.elogo.getEArchiveInvoicePdf(inv.ettn).catch(() => null);
    if (!buffer) throw new NotFoundException('Fatura PDF alınamadı');
    return { buffer, invoiceNumber: inv.invoiceNumber };
  }

  // ───────────────────────── core ─────────────────────────

  /** Gelir faturası kes (idempotent). Hata YUTULUR (non-blocking) — failed kayıt + cron retry. */
  private async cut(type: RevenueType, sourceId: string, recipientUserId: string, grossAmount: number): Promise<void> {
    try {
      if (!this.elogo.isEnabled()) {
        this.logger.debug(`eLogo kapalı — ${type} faturası atlandı (source=${sourceId})`);
        return;
      }
      if (!(grossAmount > 0)) return;

      const existing = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type, sourceId } },
      });
      if (existing && (existing.status === 'sent' || existing.status === 'signed')) return; // zaten kesildi
      if (existing) {
        await this.sendRecord(existing); // failed/pending → yeniden dene
        return;
      }

      const recipient = await this.resolveRecipient(recipientUserId);
      const now = new Date();
      const invoiceNumber = await this.allocateInvoiceNumber(now.getFullYear());
      const ettn = randomUUID();
      const vatRate = await this.resolveVatRate();
      const net = this.toNet(grossAmount, vatRate);

      const record = await this.prisma.elogoInvoice.create({
        data: {
          type,
          sourceId,
          recipientUserId,
          recipientVknTckn: recipient.vknTckn,
          recipientName: recipient.name,
          documentType: recipient.documentType,
          sendType: 'ELEKTRONIK',
          invoiceNumber,
          ettn,
          netAmount: net,
          taxAmount: this.round2(net * (vatRate / 100)),
          total: this.round2(net * (1 + vatRate / 100)),
          vatRate,
          status: 'pending',
        },
      });
      await this.sendRecord(record);
    } catch (err: any) {
      // Idempotency yarışı (aynı anda iki create) veya beklenmedik hata — yut, cron toparlar.
      this.logger.error(`eLogo ${type} faturası kesimi hata (source=${sourceId}): ${err?.message}`);
    }
  }

  /** Kayıttaki bilgilerden UBL üretip gönderir, durumu günceller. Retry-safe. */
  private async sendRecord(inv: {
    id: string;
    type: string;
    documentType: string;
    invoiceNumber: string | null;
    ettn: string | null;
    netAmount: any;
    vatRate: any;
    recipientVknTckn: string | null;
    recipientName: string | null;
    recipientUserId: string | null;
    billingReference?: string | null;
  }): Promise<void> {
    if (!inv.invoiceNumber || !inv.ettn || !inv.recipientVknTckn) return;
    const now = new Date();
    const net = Number(inv.netAmount);
    const rate = Number(inv.vatRate);
    const isEInvoice = inv.documentType === 'EINVOICE';
    const isReturn = inv.type === 'return_invoice';

    // e-Fatura'da ALIAS gerekli — retry'da yeniden çöz.
    let alias: string | undefined;
    if (isEInvoice) {
      const chk = await this.elogo.checkUser(inv.recipientVknTckn).catch(() => null);
      alias = chk?.eInvoicePkAlias;
    }

    // Alıcı e-postası + adresi UBL'e konur — eLogo e-Arşiv'i (ELEKTRONIK) bu e-postaya gönderir.
    const [recipientUser, addr] = await Promise.all([
      inv.recipientUserId
        ? this.prisma.user.findUnique({ where: { id: inv.recipientUserId }, select: { email: true } }).catch(() => null)
        : Promise.resolve(null),
      this.fetchAddress(inv.recipientUserId),
    ]);
    const party = this.buildParty(inv.recipientVknTckn, inv.recipientName || 'Müşteri', recipientUser?.email, addr);
    const desc = LINE_DESCRIPTION[inv.type] || 'Hizmet bedeli';

    let billingRef: { invoiceId: string; issueDate: string } | undefined;
    if (isReturn && inv.billingReference) {
      billingRef = { invoiceId: inv.billingReference, issueDate: this.ymd(now) };
    }

    const buildXml = (invoiceNumber: string) =>
      buildInvoiceXml({
        profileId: isEInvoice ? 'TEMELFATURA' : 'EARSIVFATURA',
        invoiceTypeCode: isReturn ? 'IADE' : 'SATIS',
        id: invoiceNumber,
        uuid: inv.ettn,
        issueDate: this.ymd(now),
        issueTime: this.hms(now),
        currency: 'TRY',
        // Gönderim şekli yalnız e-Arşiv'de gerekli (e-Fatura'da AdditionalDocumentReference yok).
        sendType: isEInvoice ? undefined : 'ELEKTRONIK',
        note: desc,
        supplier: this.supplierParty(),
        customer: party,
        lines: [{ name: desc, quantity: 1, unitPrice: net, vatRate: rate }],
        ...(billingRef ? { billingReference: billingRef } : {}),
      });

    // Paylaşımlı eLogo hesabında (özellikle demo) fatura numarası çakışırsa yeni numara
    // alıp boşluğa kadar atlayarak yeniden dener. Böylece taze bir DB'nin sequence'i,
    // hesapta zaten kullanılmış numaralarla otomatik hizalanır (elle müdahale gerekmez).
    let currentNumber = inv.invoiceNumber!;
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const { xml, totals } = buildXml(currentNumber);
        const res = await this.elogo.sendDocument({
          documentType: inv.documentType as ElogoDocumentType,
          documentUuid: inv.ettn,
          documentNumber: currentNumber,
          ublXml: xml,
          signed: false,
          ...(alias ? { alias } : {}),
          ...(this.xsltUuid ? { xsltUuid: this.xsltUuid } : {}),
        });

        if (res.success) {
          await this.prisma.elogoInvoice.update({
            where: { id: inv.id },
            data: {
              invoiceNumber: currentNumber,
              netAmount: totals.taxExclusive,
              taxAmount: totals.tax,
              total: totals.payable,
              status: 'sent',
              elogoRefId: res.refId != null ? String(res.refId) : null,
              elogoResultCode: res.code ?? null,
              elogoResultMsg: res.description ?? null,
              attemptCount: { increment: 1 },
              lastAttemptAt: now,
              issuedAt: now,
              sentAt: now,
            },
          });
          this.logger.log(`eLogo ${inv.type} faturası gönderildi (${currentNumber}, ref=${res.refId})`);
          // PDF'i eLogo'dan çek → S3'e kaydet → alıcıya KENDİ SMTP'mizden e-postala (best-effort).
          void this.deliverPdf(
            {
              id: inv.id,
              ettn: inv.ettn,
              invoiceNumber: currentNumber,
              type: inv.type,
              total: totals.payable,
              currentPdfUrl: (inv as any).pdfUrl ?? null,
              recipientName: inv.recipientName,
            },
            recipientUser?.email ?? null,
          ).catch((e) => this.logger.warn(`eLogo PDF teslim hatası (${currentNumber}): ${e?.message}`));
          return;
        }

        // Numara çakışması → ARTAN adımla ileri atla (ardışık dolu numara bloğunu az
        // denemede geç: 1,2,3,... büyüyen sıçrama; 12 denemede ~78 numaralık blok aşılır).
        if (attempt < 11 && this.isDuplicateNumberError(res.description)) {
          const skip = attempt + 1;
          for (let s = 0; s < skip; s++) {
            currentNumber = await this.allocateInvoiceNumber(now.getFullYear());
          }
          this.logger.warn(
            `eLogo numara çakışması → +${skip} atlanıp ${currentNumber} ile tekrar (${inv.type})`,
          );
          continue;
        }

        // Başka bir red (veya çakışma denemeleri tükendi) → failed olarak işaretle.
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            netAmount: totals.taxExclusive,
            taxAmount: totals.tax,
            total: totals.payable,
            status: 'failed',
            elogoResultCode: res.code ?? null,
            elogoResultMsg: res.description ?? null,
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
          },
        });
        this.logger.error(`eLogo ${inv.type} faturası reddedildi (${currentNumber}): ${res.description}`);
        return;
      }
    } catch (err: any) {
      await this.prisma.elogoInvoice
        .update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            status: 'failed',
            elogoResultMsg: String(err?.message || err).slice(0, 500),
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
          },
        })
        .catch(() => undefined);
      this.logger.error(`eLogo ${inv.type} faturası gönderim hatası (${currentNumber}): ${err?.message}`);
    }
  }

  /** eLogo "aynı fatura numarası tekrar kullanılamaz" reddini tanı (paylaşımlı hesapta numara çakışması). */
  private isDuplicateNumberError(msg?: string | null): boolean {
    if (!msg) return false;
    const m = msg.toLocaleLowerCase('tr');
    return (
      m.includes('tekrar kullanılamaz') ||
      m.includes('aynı fatura numarası') ||
      (m.includes('daha önce') && m.includes('fatura'))
    );
  }

  /**
   * Kesilen e-Arşiv PDF'ini eLogo'dan çek → S3'e kaydet → alıcıya KENDİ SMTP'mizden e-postala.
   * Demo eLogo mail atmadığı için maili biz atıyoruz; PDF de uygulamada gösterilebilsin diye S3'te.
   * Tamamen best-effort: hata kesimi etkilemez.
   */
  private async deliverPdf(
    inv: { id: string; ettn: string; invoiceNumber: string; type: string; total: any; currentPdfUrl: string | null; recipientName?: string | null },
    recipientEmail: string | null,
  ): Promise<void> {
    // MAIL-ONCE GARANTİSİ: bu fatura zaten maillendiyse ASLA tekrar gönderme. Çok sayıda tetik
    // (completeOrder/confirmDelivery/admin/cron/at_warehouse) aynı faturayı işleyebilir; emailSentAt
    // dolu ise çık. (cut() zaten sent'te no-op yapar; bu ikinci emniyet — yarış durumları için.)
    const fresh = await this.prisma.elogoInvoice
      .findUnique({ where: { id: inv.id }, select: { emailSentAt: true } })
      .catch(() => null);
    if (fresh?.emailSentAt) {
      this.logger.debug(`eLogo mail zaten gönderilmiş (${inv.invoiceNumber}) — tekrar atlanıyor`);
      return;
    }
    const pdf = await this.elogo.getEArchiveInvoicePdf(inv.ettn).catch(() => null);
    if (!pdf || pdf.length < 200) {
      this.logger.warn(`eLogo PDF alınamadı (${inv.invoiceNumber}) — S3/mail atlandı`);
      return;
    }
    // 1) S3'e kaydet (documents bucket).
    let pdfKey = inv.currentPdfUrl;
    try {
      if (this.storage?.isStorageAvailable?.()) {
        const up = await this.storage.uploadFile(pdf, {
          bucket: 'documents',
          folder: 'elogo-invoices',
          filename: `${inv.invoiceNumber}.pdf`,
          mimeType: 'application/pdf',
          isPublic: false,
          entityType: 'elogo_invoice',
          entityId: inv.id,
        } as any);
        pdfKey = up.key;
      }
    } catch (e: any) {
      this.logger.warn(`eLogo PDF S3 yükleme hatası (${inv.invoiceNumber}): ${e?.message}`);
    }
    // 2) Alıcıya kendi SMTP'mizden e-postala (PDF ekli). Şablon = admin'den düzenlenebilir
    //    'elogo-invoice' (DB override) → yoksa koddaki güzel Tarodan varsayılanı.
    let emailedAt: Date | null = null;
    try {
      if (recipientEmail && this.smtp) {
        const desc = LINE_DESCRIPTION[inv.type] || 'Hizmet bedeli';
        const tplKey = 'elogo-invoice';
        const tplData = {
          recipientName: inv.recipientName || 'Değerli Müşterimiz',
          description: desc,
          invoiceNumber: inv.invoiceNumber,
          total: Number(inv.total),
          type: inv.type,
        };
        const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://tarodan.com');
        const dbTpl = await this.prisma.emailTemplate
          .findUnique({ where: { key: tplKey } })
          .catch(() => null);
        const html = dbTpl?.bodyHtml
          ? substituteEmailVariables(dbTpl.bodyHtml, tplData)
          : renderEmailTemplate(tplKey, tplData, frontendUrl);
        const subject = dbTpl?.subject
          ? substituteEmailVariables(dbTpl.subject, tplData)
          : getEmailTemplateSubject(tplKey, tplData);
        await this.smtp.sendEmail({
          to: recipientEmail,
          subject,
          html,
          attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
        } as any);
        emailedAt = new Date();
      }
    } catch (e: any) {
      this.logger.warn(`eLogo PDF e-posta hatası (${inv.invoiceNumber}): ${e?.message}`);
    }
    // 3) Kaydı güncelle (pdfUrl + emailSentAt).
    await this.prisma.elogoInvoice
      .update({ where: { id: inv.id }, data: { pdfUrl: pdfKey, emailSentAt: emailedAt } })
      .catch(() => undefined);
    this.logger.log(
      `eLogo PDF teslim (${inv.invoiceNumber}): S3=${pdfKey ? 'OK' : '-'} mail=${emailedAt ? recipientEmail : '-'}`,
    );
  }

  /** Kesilmiş bir faturayı tersine çevir: e-Arşiv ≤8g → İPTAL, >8g veya e-Fatura → İADE FATURASI. */
  private async reverseInvoice(inv: {
    id: string;
    type: string;
    sourceId: string;
    documentType: string;
    invoiceNumber: string | null;
    ettn: string | null;
    elogoRefId: string | null;
    issuedAt: Date | null;
    recipientUserId: string | null;
    recipientVknTckn: string | null;
    recipientName: string | null;
    netAmount: any;
    vatRate: any;
  }): Promise<void> {
    if (!inv.ettn || !inv.invoiceNumber || !inv.issuedAt) return;
    const canCancel = inv.documentType === 'EARCHIVE' && this.elogo.refundStrategy(inv.issuedAt) === 'CANCEL';

    if (canCancel) {
      const res = await this.elogo
        .cancelEArchiveInvoice(inv.ettn, inv.elogoRefId ?? undefined)
        .catch((e: any) => ({ success: false, description: String(e?.message) }) as any);
      if (res.success) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'refund', elogoResultMsg: res.description ?? null },
        });
        this.logger.log(`eLogo iptal ${inv.invoiceNumber}: OK`);
        return;
      }
      // İptal BAŞARISIZ → İADE FATURASINA düş (her durumda reversal garanti; orijinali 'sent' bırak).
      this.logger.warn(`eLogo iptal başarısız (${inv.invoiceNumber}): ${res.description} → iade faturasına düşülüyor`);
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: { cancelReason: 'refund', elogoResultMsg: res.description ?? null },
      });
      // aşağıdaki İADE FATURASI yoluna devam (return yok)
    }

    // İADE FATURASI: orijinali referans alan ters e-belge. sourceId = ORİJİNAL FATURA id'si
    // (aynı siparişin komisyon+hizmet faturaları ayrı iade faturası alsın diye; orderId DEĞİL).
    const exists = await this.prisma.elogoInvoice.findUnique({
      where: { type_sourceId: { type: 'return_invoice', sourceId: inv.id } },
    });
    if (exists) return;
    const now = new Date();
    const number = await this.allocateInvoiceNumber(now.getFullYear());
    const record = await this.prisma.elogoInvoice.create({
      data: {
        type: 'return_invoice',
        sourceId: inv.id,
        recipientUserId: inv.recipientUserId,
        recipientVknTckn: inv.recipientVknTckn,
        recipientName: inv.recipientName,
        documentType: inv.documentType,
        sendType: 'ELEKTRONIK',
        invoiceNumber: number,
        ettn: randomUUID(),
        netAmount: inv.netAmount,
        taxAmount: this.round2(Number(inv.netAmount) * (Number(inv.vatRate) / 100)),
        total: this.round2(Number(inv.netAmount) * (1 + Number(inv.vatRate) / 100)),
        vatRate: inv.vatRate,
        status: 'pending',
        billingReference: inv.invoiceNumber,
      },
    });
    await this.sendRecord(record);
  }
}
