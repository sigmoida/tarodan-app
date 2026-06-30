/**
 * NetGSM SMS Provider — yalnızca telefon doğrulama OTP'leri için.
 * Mevcut Twilio SmsProvider'a dokunulmaz; bu ayrı bir sağlayıcıdır.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NetGsmResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class NetGsmProvider {
  private readonly logger = new Logger(NetGsmProvider.name);
  private readonly usercode: string;
  private readonly password: string;
  private readonly msgheader: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.usercode = this.configService.get<string>('NETGSM_USERCODE', '').trim();
    this.password = this.configService.get<string>('NETGSM_PASSWORD', '').trim();
    this.msgheader = this.configService.get<string>('NETGSM_MSGHEADER', '').trim();
    this.baseUrl = this.configService
      .get<string>('NETGSM_BASE_URL', 'https://api.netgsm.com.tr')
      .trim();
    this.enabled = !!this.usercode && !!this.password && !!this.msgheader;

    if (!this.enabled) {
      this.logger.warn('NetGSM yapılandırılmadı. OTP SMS yalnızca log\'a yazılacak.');
    }
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  /** Türk numarasını E.164 (+90...) formatına getirir. */
  formatTurkishNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('90') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+9${digits}`;
    if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
    return phone.startsWith('+') ? phone : `+${digits}`;
  }

  /** E.164'ten NetGSM'in beklediği 905XXXXXXXXX biçimine çevirir. */
  toNetgsmNumber(phone: string): string {
    const e164 = this.formatTurkishNumber(phone);
    return e164.replace(/^\+/, '');
  }

  /** NetGSM response kodunu anlamlı sonuca çevirir. */
  mapResponseCode(code: string): { success: boolean; error?: string } {
    switch (code) {
      case '00':
      case '01':
      case '02':
        return { success: true };
      case '20':
        return { success: false, error: 'Mesaj içeriği/karakter hatası (20)' };
      case '30':
        return { success: false, error: 'Geçersiz kimlik veya API erişimi yok (30)' };
      case '40':
        return { success: false, error: 'Onaysız/tanımsız gönderici başlık (40)' };
      case '50':
        return { success: false, error: 'İYS kaynaklı gönderim engeli (50)' };
      case '70':
        return { success: false, error: 'Geçersiz parametre (70)' };
      case '80':
        return { success: false, error: 'Gönderim limiti aşıldı (80)' };
      case '85':
        return { success: false, error: 'Mükerrer gönderim limiti (85)' };
      default:
        return { success: false, error: `NetGSM hata kodu: ${code}` };
    }
  }

  /** OTP doğrulama kodu gönderir. */
  async sendOtp(phone: string, code: string): Promise<NetGsmResult> {
    const no = this.toNetgsmNumber(phone);
    const msg = `Tarodan dogrulama kodunuz: ${code}. Bu kod 3 dakika gecerlidir.`;

    if (!this.enabled) {
      this.logger.log(`[NETGSM-MOCK] To: ${no}, Code: ${code}`);
      return { success: true, messageId: `mock-netgsm-${no}` };
    }

    try {
      const auth = Buffer.from(`${this.usercode}:${this.password}`).toString('base64');
      const response = await fetch(`${this.baseUrl}/sms/rest/v2/send`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          msgheader: this.msgheader,
          encoding: 'TR',
          messages: [{ msg, no }],
        }),
      });

      const result: any = await response.json().catch(() => ({}));

      // NetGSM API hatalarını ÇOĞUNLUKLA HTTP 406 ile döndürür ve asıl sebep
      // gövdedeki `code` alanındadır (30=kimlik/API erişimi yok, 40=onaysız başlık,
      // 70=geçersiz parametre vb.). Bu yüzden HTTP hata olsa bile önce gövdedeki
      // kodu maplemeye çalış; yoksa ham gövdeyi+statüyü logla (teşhis için).
      if (!response.ok) {
        const bodyCode = String(result?.code ?? '');
        if (bodyCode) {
          const mapped = this.mapResponseCode(bodyCode);
          this.logger.error(
            `NetGSM hatası (HTTP ${response.status}, code=${bodyCode}): ${mapped.error ?? 'bilinmeyen'} | gövde: ${JSON.stringify(result)}`,
          );
          return mapped.success
            ? { success: false, error: `NetGSM HTTP ${response.status}` }
            : mapped;
        }
        this.logger.error(
          `NetGSM HTTP hatası: ${response.status} | gövde: ${JSON.stringify(result)}`,
        );
        return { success: false, error: `NetGSM HTTP ${response.status}` };
      }

      const mapped = this.mapResponseCode(String(result.code ?? ''));
      if (!mapped.success) {
        this.logger.error(`NetGSM gönderim hatası: ${mapped.error}`);
        return mapped;
      }

      this.logger.log(`NetGSM OTP gönderildi: ${no}, jobid: ${result.jobid}`);
      return { success: true, messageId: result.jobid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      this.logger.error(`NetGSM gönderimi başarısız: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}
