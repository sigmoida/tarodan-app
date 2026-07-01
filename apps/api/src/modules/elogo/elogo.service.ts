import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElogoSoapClient } from './elogo-soap.client';
import type {
  ElogoDocumentStatus,
  ElogoDocumentType,
  ElogoSendDocumentParams,
  ElogoSendResult,
  ElogoSession,
  ElogoSoapCallOptions,
} from './elogo.types';

/** DI token — Stub/Live client factory ile sağlanır. */
export const ELOGO_SOAP_CLIENT = 'ELOGO_SOAP_CLIENT';

/** Oturum yeniden kullanım süresi (ms). Bu süreden eskiyse yeniden login. */
const SESSION_TTL_MS = 20 * 60 * 1000; // 20 dk

/**
 * eLogo e-Belge servisi — yüksek seviye iş mantığı.
 * SOAP detaylarını ElogoSoapClient'a bırakır; burada oturum yönetimi,
 * e-Fatura/e-Arşiv kararı ve dış modüllerin kullanacağı sade API var.
 */
@Injectable()
export class ElogoService {
  private readonly logger = new Logger(ElogoService.name);
  private session: ElogoSession | null = null;
  /** Eşzamanlı çağrılarda tek login yapılsın diye uçuştaki login promise'i. */
  private loginInFlight: Promise<ElogoSession> | null = null;

  constructor(
    @Inject(ELOGO_SOAP_CLIENT) private readonly client: ElogoSoapClient,
    private readonly configService: ConfigService,
  ) {}

  /** Entegrasyon açık mı? (ELOGO_ENABLED=true). Kapalıysa çağıranlar atlamalı. */
  isEnabled(): boolean {
    return this.configService.get<string>('ELOGO_ENABLED', 'false')?.trim().toLowerCase() === 'true';
  }

  private get callOptions(): ElogoSoapCallOptions {
    return {
      timeoutMs: Number(this.configService.get<string>('ELOGO_SOAP_TIMEOUT_MS', '30000')) || 30000,
    };
  }

  /** Geçerli oturumu döndür; yoksa/eskiyse yeniden login. Eşzamanlı çağrıları tekleştirir. */
  private async getSession(): Promise<ElogoSession> {
    const now = Date.now();
    if (this.session && now - this.session.acquiredAt < SESSION_TTL_MS) {
      return this.session;
    }
    if (this.loginInFlight) return this.loginInFlight;

    this.loginInFlight = (async () => {
      const s = await this.client.login(this.callOptions);
      this.session = { ...s, acquiredAt: Date.now() };
      return this.session;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  /** Oturum gerektiren çağrı; auth hatasında bir kez yeniden login deneyerek tekrarlar. */
  private async withSession<T>(fn: (sessionId: string) => Promise<T>): Promise<T> {
    const session = await this.getSession();
    try {
      return await fn(session.sessionId);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      const looksAuth =
        msg.includes('session') || msg.includes('oturum') || msg.includes('login') || msg.includes('yetki');
      if (looksAuth) {
        this.logger.warn('eLogo oturum geçersiz olabilir, yeniden login deneniyor');
        this.session = null;
        const fresh = await this.getSession();
        return await fn(fresh.sessionId);
      }
      throw err;
    }
  }

  /**
   * Bağlantı testi: login + logout. Kimlik/erişim doğru mu kontrol için.
   * Fatura kesmez. Probe/health amaçlı.
   */
  async testConnection(): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    try {
      const session = await this.client.login(this.callOptions);
      await this.client.logout(session.sessionId, this.callOptions);
      return { ok: true, sessionId: session.sessionId };
    } catch (err: any) {
      this.logger.error(`eLogo bağlantı testi başarısız: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Alıcının VKN/TCKN'sine göre belge senaryosu: GİB e-Fatura mükellefiyse EINVOICE,
   * değilse EARCHIVE. identifier boşsa (kimlik yoksa) EARCHIVE kabul edilir.
   */
  async resolveDocumentType(identifier?: string | null): Promise<ElogoDocumentType> {
    if (!identifier) return 'EARCHIVE';
    try {
      const [result] = await this.withSession((sid) =>
        this.client.checkUser([identifier], sid, this.callOptions),
      );
      return result?.isEInvoiceUser ? 'EINVOICE' : 'EARCHIVE';
    } catch (err: any) {
      // Sorgu başarısızsa güvenli taraf: e-Arşiv (bireysel) varsay.
      this.logger.warn(`checkUser başarısız (${identifier}), EARCHIVE varsayıldı: ${err.message}`);
      return 'EARCHIVE';
    }
  }

  /** Bir VKN/TCKN için tam mükellef sorgu sonucu (e-Fatura ise ALIAS/PK etiketi dahil). */
  async checkUser(identifier: string): Promise<import('./elogo.types').ElogoUserCheckResult | null> {
    const [result] = await this.withSession((sid) =>
      this.client.checkUser([identifier], sid, this.callOptions),
    );
    return result ?? null;
  }

  /** UBL-TR (base64) belgeyi gönder. */
  async sendDocument(params: ElogoSendDocumentParams): Promise<ElogoSendResult> {
    return this.withSession((sid) => this.client.sendDocument(params, sid, this.callOptions));
  }

  /** Belge durumunu sorgula. */
  async getDocumentStatus(
    documentUuid: string,
    documentType: ElogoDocumentType = 'EARCHIVE',
  ): Promise<ElogoDocumentStatus> {
    return this.withSession((sid) =>
      this.client.getDocumentStatus(documentUuid, documentType, sid, this.callOptions),
    );
  }

  /** e-Arşiv faturasını İPTAL et (yalnızca fatura tarihinden ≤8 gün içinde geçerli). */
  async cancelEArchiveInvoice(uuid: string, elementId?: string): Promise<ElogoSendResult> {
    return this.withSession((sid) => this.client.cancelEArchive(uuid, elementId, sid, this.callOptions));
  }

  /** Kesilmiş e-Arşiv faturanın PDF'ini çek (S3/mail için). */
  async getEArchiveInvoicePdf(uuid: string): Promise<Buffer | null> {
    return this.withSession((sid) => this.client.getEArchiveInvoicePdf(uuid, sid, this.callOptions));
  }

  /**
   * İade durumunda izlenecek yol (mevzuat): fatura tarihinden **≤8 gün** ise e-Arşiv İPTAL,
   * **>8 gün** ise iptal yapılamaz → İADE FATURASI (InvoiceTypeCode=IADE, orijinali referans).
   * Çağıran taraf 'CANCEL' → cancelEArchiveInvoice(), 'RETURN_INVOICE' → sendDocument(IADE UBL) yapar.
   */
  refundStrategy(invoiceIssueDate: Date | string, now: Date = new Date()): 'CANCEL' | 'RETURN_INVOICE' {
    const issued = typeof invoiceIssueDate === 'string' ? new Date(invoiceIssueDate) : invoiceIssueDate;
    const daysElapsed = Math.floor((now.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000));
    return daysElapsed <= 8 ? 'CANCEL' : 'RETURN_INVOICE';
  }
}
