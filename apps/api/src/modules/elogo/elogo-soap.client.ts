import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { deflateRawSync } from 'zlib';
import type {
  ElogoDocumentStatus,
  ElogoSendDocumentParams,
  ElogoSendResult,
  ElogoSession,
  ElogoSoapCallOptions,
  ElogoUserCheckResult,
} from './elogo.types';

/**
 * eLogo PostBoxService (SOAP) soyutlaması.
 * Sürat Kargo SOAP client deseniyle aynı yapı: abstract + Stub + Live,
 * ConfigService ile beslenir, factory ile DI edilir.
 *
 * Metot eşlemesi (PostBoxService):
 *   login            → Login
 *   logout           → Logout
 *   checkUser        → GetValidateGIBUser  (VKN e-Fatura mükellefi mi)
 *   sendDocument     → SendDocument        (UBL-TR → ZIP → base64)
 *   getDocumentStatus→ GetDocumentStatus
 */
export abstract class ElogoSoapClient {
  abstract login(options: ElogoSoapCallOptions): Promise<ElogoSession>;
  abstract logout(sessionId: string, options: ElogoSoapCallOptions): Promise<void>;
  abstract checkUser(
    identifiers: string[],
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoUserCheckResult[]>;
  abstract sendDocument(
    params: ElogoSendDocumentParams,
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoSendResult>;
  abstract getDocumentStatus(
    documentUuid: string,
    documentType: string,
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoDocumentStatus>;
}

// ─── Stub (dev/test) ──────────────────────────────────────────────────────────

/**
 * Config odaklı stub. Gerçek SOAP çağrısı yapmaz.
 * ELOGO_STUB_THROW=TIMEOUT|NETWORK|HTTP_5XX|SOAP_FAULT teknik hata simüle eder.
 * ELOGO_STUB_EINVOICE_VKNS="111,222" → bu VKN'ler e-Fatura mükellefi sayılır.
 */
@Injectable()
export class StubElogoSoapClient extends ElogoSoapClient {
  private readonly logger = new Logger(StubElogoSoapClient.name);
  public readonly sentDocuments: ElogoSendDocumentParams[] = [];
  public readonly checkUserCalls: string[][] = [];
  private loginCount = 0;

  reset(): void {
    this.sentDocuments.length = 0;
    this.checkUserCalls.length = 0;
    this.loginCount = 0;
  }

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private simulate(): void {
    const sim = this.configService.get<string>('ELOGO_STUB_THROW', '')?.trim().toUpperCase();
    if (sim === 'TIMEOUT') {
      const err = new Error('ETIMEDOUT');
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      throw err;
    }
    if (sim === 'NETWORK') {
      const err = new Error('ECONNRESET');
      (err as NodeJS.ErrnoException).code = 'ECONNRESET';
      throw err;
    }
    if (sim === 'HTTP_5XX') {
      const err = new Error('HTTP 500');
      (err as any).statusCode = 500;
      throw err;
    }
    if (sim === 'SOAP_FAULT') throw new Error('SOAP Fault: server');
  }

  async login(_options: ElogoSoapCallOptions): Promise<ElogoSession> {
    this.simulate();
    this.loginCount += 1;
    this.logger.debug(`Stub eLogo login #${this.loginCount}`);
    return { sessionId: `G;stub-session-${this.loginCount}`, acquiredAt: 0 };
  }

  async logout(sessionId: string, _options: ElogoSoapCallOptions): Promise<void> {
    this.logger.debug(`Stub eLogo logout session=${sessionId}`);
  }

  async checkUser(
    identifiers: string[],
    _sessionId: string,
    _options: ElogoSoapCallOptions,
  ): Promise<ElogoUserCheckResult[]> {
    this.simulate();
    this.checkUserCalls.push(identifiers);
    const eInvoiceVkns = (this.configService.get<string>('ELOGO_STUB_EINVOICE_VKNS', '') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return identifiers.map((identifier) => {
      const isEInvoiceUser = eInvoiceVkns.includes(identifier);
      return {
        identifier,
        isEInvoiceUser,
        eInvoicePkAlias: isEInvoiceUser ? 'urn:mail:defaultpk@elogo.com.tr' : undefined,
      };
    });
  }

  async sendDocument(
    params: ElogoSendDocumentParams,
    _sessionId: string,
    _options: ElogoSoapCallOptions,
  ): Promise<ElogoSendResult> {
    this.simulate();
    this.sentDocuments.push(params);
    this.logger.debug(
      `Stub eLogo sendDocument type=${params.documentType} uuid=${params.documentUuid}`,
    );
    return { success: true, documentUuid: params.documentUuid, code: 1, description: 'OK (stub)', refId: this.sentDocuments.length };
  }

  async getDocumentStatus(
    documentUuid: string,
    _documentType: string,
    _sessionId: string,
    _options: ElogoSoapCallOptions,
  ): Promise<ElogoDocumentStatus> {
    this.simulate();
    return { documentUuid, status: 2, code: 1300, description: 'BASARIYLA TAMAMLANDI (stub)', isCancel: false };
  }
}

// ─── SOAP / XML / ZIP yardımcıları ─────────────────────────────────────────────

const TEM = 'http://tempuri.org/';
const EFAT = 'http://schemas.datacontract.org/2004/07/eFaturaWebService';
const ARR = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function throwIfSoapFault(xml: string): void {
  const fault = extractTag(xml, 'faultstring');
  if (fault) throw new Error(`SOAP Fault: ${fault}`);
}

/** paramList ("Name=Value" dizisi) → <arr:string> öğeleri. */
function paramListXml(params: string[]): string {
  return params.map((p) => `<arr:string>${escapeXml(p)}</arr:string>`).join('');
}

// CRC-32 (ZIP için gerekli)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Tek dosyalık, bağımsız (deps'siz) ZIP üretir (deflate / yöntem 8). */
function makeZip(fileName: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(fileName, 'utf8');
  const crc = crc32(content);
  const compressed = deflateRawSync(content);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(8, 8); // method = deflate
  localHeader.writeUInt16LE(0, 10); // modtime
  localHeader.writeUInt16LE(0x21, 12); // moddate (1980-01-01)
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra len
  const localOffset = 0;

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central dir signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(localOffset, 42);

  const localBlock = Buffer.concat([localHeader, nameBuf, compressed]);
  const centralBlock = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // total entries this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralBlock.length, 12); // central dir size
  eocd.writeUInt32LE(localBlock.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Live SOAP client ──────────────────────────────────────────────────────────

const DEFAULT_SOAP_URL = 'https://pb.elogo.com.tr/PostBoxService.svc';
const CONTRACT = 'IPostBoxService';

/** Üretim SOAP client — gerçek eLogo PostBoxService'e XML POST eder. */
@Injectable()
export class LiveElogoSoapClient extends ElogoSoapClient {
  private readonly logger = new Logger(LiveElogoSoapClient.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private get url(): string {
    return this.configService.get<string>('ELOGO_SOAP_URL', DEFAULT_SOAP_URL);
  }

  private creds(): { userName: string; password: string } {
    const userName = this.configService.get<string>('ELOGO_WS_USERNAME', '');
    const password = this.configService.get<string>('ELOGO_WS_PASSWORD', '');
    if (!userName || !password) {
      throw new Error('ELOGO_WS_USERNAME or ELOGO_WS_PASSWORD not configured');
    }
    return { userName, password };
  }

  private async post(operation: string, bodyInner: string, options: ElogoSoapCallOptions): Promise<string> {
    const soapXml =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${TEM}" xmlns:arr="${ARR}" xmlns:efat="${EFAT}">` +
      `<soapenv:Header/><soapenv:Body>${bodyInner}</soapenv:Body></soapenv:Envelope>`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${TEM}${CONTRACT}/${operation}` },
        body: soapXml,
        signal: controller.signal,
      });
      if (response.status >= 500) {
        const text = await response.text().catch(() => '');
        try {
          throwIfSoapFault(text);
        } catch (e) {
          throw e;
        }
        const err = new Error(`HTTP ${response.status}`);
        (err as any).statusCode = response.status;
        throw err;
      }
      const text = await response.text();
      throwIfSoapFault(text);
      return text;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const err = new Error('ETIMEDOUT');
        (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async login(options: ElogoSoapCallOptions): Promise<ElogoSession> {
    const { userName, password } = this.creds();
    const inner =
      `<tem:Login><tem:login>` +
      `<efat:appStr>Tarodan</efat:appStr>` +
      `<efat:passWord>${escapeXml(password)}</efat:passWord>` +
      `<efat:source></efat:source>` +
      `<efat:userName>${escapeXml(userName)}</efat:userName>` +
      `<efat:version>1.0</efat:version>` +
      `</tem:login></tem:Login>`;
    const xml = await this.post('Login', inner, options);
    const sessionId = extractTag(xml, 'sessionID');
    const result = extractTag(xml, 'LoginResult');
    if (!sessionId || result === 'false') {
      throw new Error(`eLogo login başarısız (LoginResult=${result}). Yanıt: ${xml.slice(0, 400)}`);
    }
    this.logger.log('eLogo login başarılı');
    return { sessionId, acquiredAt: 0 };
  }

  async logout(sessionId: string, options: ElogoSoapCallOptions): Promise<void> {
    try {
      await this.post('Logout', `<tem:Logout><tem:sessionID>${escapeXml(sessionId)}</tem:sessionID></tem:Logout>`, options);
    } catch (err: any) {
      this.logger.warn(`eLogo logout hatası (yutuldu): ${err.message}`);
    }
  }

  async checkUser(
    identifiers: string[],
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoUserCheckResult[]> {
    // GetValidateGIBUser tek VKN sorgular → her identifier için ayrı çağrı.
    const results: ElogoUserCheckResult[] = [];
    for (const identifier of identifiers) {
      const inner =
        `<tem:GetValidateGIBUser><tem:sessionID>${escapeXml(sessionId)}</tem:sessionID>` +
        `<tem:paramList>${paramListXml([`VKN=${identifier}`, 'DOCUMENTTYPE=0'])}</tem:paramList>` +
        `</tem:GetValidateGIBUser>`;
      const xml = await this.post('GetValidateGIBUser', inner, options);
      const kv = parseKeyValues(xml);
      results.push({
        identifier,
        isEInvoiceUser: kv['ISGIBUSER'] === '1',
        eInvoicePkAlias: kv['EINVOICEPKALIAS'] || undefined,
        registerTime: kv['REGISTERTIME'] || undefined,
      });
    }
    return results;
  }

  async sendDocument(
    params: ElogoSendDocumentParams,
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoSendResult> {
    const innerXmlName = `${params.documentNumber || params.documentUuid}.xml`;
    const zip = makeZip(innerXmlName, Buffer.from(params.ublXml, 'utf8'));
    const base64 = zip.toString('base64');
    const md5 = createHash('md5').update(zip).digest('hex').toUpperCase();
    const fileName = `${params.documentUuid}.zip`;

    const pl: string[] = [`DOCUMENTTYPE=${params.documentType}`, `SIGNED=${params.signed ? 1 : 0}`];
    if (params.alias) pl.push(`ALIAS=${params.alias}`);
    if (params.xsltUuid) pl.push(`XSLTUUID=${params.xsltUuid}`);

    const inner =
      `<tem:SendDocument><tem:sessionID>${escapeXml(sessionId)}</tem:sessionID>` +
      `<tem:paramList>${paramListXml(pl)}</tem:paramList>` +
      `<tem:document>` +
      `<efat:binaryData><efat:Value>${base64}</efat:Value><efat:contentType>base64</efat:contentType></efat:binaryData>` +
      `<efat:currentDate>${todayIso()}</efat:currentDate>` +
      `<efat:fileName>${escapeXml(fileName)}</efat:fileName>` +
      `<efat:hash>${md5}</efat:hash>` +
      `</tem:document></tem:SendDocument>`;

    const xml = await this.post('SendDocument', inner, options);
    const code = Number(extractTag(xml, 'resultCode') ?? NaN);
    const description = extractTag(xml, 'resultMsg') || undefined;
    const refId = Number(extractTag(xml, 'refId') ?? NaN);
    return {
      success: code === 1,
      documentUuid: params.documentUuid,
      code: Number.isNaN(code) ? undefined : code,
      description,
      refId: Number.isNaN(refId) ? undefined : refId,
    };
  }

  async getDocumentStatus(
    documentUuid: string,
    documentType: string,
    sessionId: string,
    options: ElogoSoapCallOptions,
  ): Promise<ElogoDocumentStatus> {
    const inner =
      `<tem:GetDocumentStatus><tem:sessionID>${escapeXml(sessionId)}</tem:sessionID>` +
      `<tem:uuid>${escapeXml(documentUuid)}</tem:uuid>` +
      `<tem:paramList>${paramListXml([`DOCUMENTTYPE=${documentType}`])}</tem:paramList>` +
      `</tem:GetDocumentStatus>`;
    const xml = await this.post('GetDocumentStatus', inner, options);
    return {
      documentUuid,
      status: Number(extractTag(xml, 'status') ?? NaN),
      code: Number(extractTag(xml, 'code') ?? NaN) || undefined,
      description: extractTag(xml, 'description') || undefined,
      isCancel: extractTag(xml, 'isCancel') === 'true',
    };
  }
}

/** Yanıttaki tüm "KEY=VALUE" string'lerini map'e çevirir (GetValidateGIBUser outputList). */
function parseKeyValues(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = />\s*([A-Z_]+)\s*=\s*([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}
