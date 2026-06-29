import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ElogoService, ELOGO_SOAP_CLIENT } from './elogo.service';
import { StubElogoSoapClient } from './elogo-soap.client';
import type { ElogoSession, ElogoUserCheckResult } from './elogo.types';

function fakeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, def?: string) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

describe('ElogoService', () => {
  let login: jest.Mock;
  let logout: jest.Mock;
  let checkUser: jest.Mock;
  let sendDocument: jest.Mock;
  let getDocumentStatus: jest.Mock;

  async function buildService(config: Record<string, string> = {}): Promise<ElogoService> {
    login = jest.fn(
      async (): Promise<ElogoSession> => ({ sessionId: 'G;sess-1', acquiredAt: 0 }),
    );
    logout = jest.fn(async () => undefined);
    checkUser = jest.fn(
      async (ids: string[]): Promise<ElogoUserCheckResult[]> =>
        ids.map((identifier) => ({ identifier, isEInvoiceUser: false })),
    );
    sendDocument = jest.fn(async () => ({ success: true, code: 1, refId: 42 }));
    getDocumentStatus = jest.fn(async () => ({ documentUuid: 'u', status: 2, code: 1300 }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ElogoService,
        {
          provide: ELOGO_SOAP_CLIENT,
          useValue: { login, logout, checkUser, sendDocument, getDocumentStatus },
        },
        { provide: ConfigService, useValue: fakeConfig(config) },
      ],
    }).compile();
    return moduleRef.get(ElogoService);
  }

  it('isEnabled() ELOGO_ENABLED değerine bağlı', async () => {
    expect((await buildService({})).isEnabled()).toBe(false);
    expect((await buildService({ ELOGO_ENABLED: 'true' })).isEnabled()).toBe(true);
    expect((await buildService({ ELOGO_ENABLED: 'TRUE' })).isEnabled()).toBe(true);
  });

  it('resolveDocumentType: kimlik yoksa EARCHIVE (checkUser çağrılmaz)', async () => {
    const service = await buildService();
    expect(await service.resolveDocumentType(null)).toBe('EARCHIVE');
    expect(await service.resolveDocumentType('')).toBe('EARCHIVE');
    expect(checkUser).not.toHaveBeenCalled();
  });

  it('resolveDocumentType: mükellef değilse EARCHIVE, mükellefse EINVOICE', async () => {
    const service = await buildService();
    expect(await service.resolveDocumentType('11111111111')).toBe('EARCHIVE');

    checkUser.mockResolvedValueOnce([
      { identifier: '1234567890', isEInvoiceUser: true, eInvoicePkAlias: 'urn:mail:pk@x' },
    ]);
    expect(await service.resolveDocumentType('1234567890')).toBe('EINVOICE');
  });

  it('resolveDocumentType: checkUser patlarsa güvenli taraf EARCHIVE', async () => {
    const service = await buildService();
    checkUser.mockRejectedValueOnce(new Error('boom'));
    expect(await service.resolveDocumentType('1234567890')).toBe('EARCHIVE');
  });

  it('oturum cache: arka arkaya çağrılarda tek login yapılır', async () => {
    const service = await buildService();
    await service.resolveDocumentType('1');
    await service.sendDocument({
      documentType: 'EARCHIVE',
      documentUuid: 'u1',
      ublXml: '<Invoice/>',
    });
    await service.getDocumentStatus('u1', 'EARCHIVE');
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('testConnection: login+logout başarılıysa ok:true', async () => {
    const service = await buildService();
    const res = await service.testConnection();
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe('G;sess-1');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('testConnection: login patlarsa ok:false + error', async () => {
    const service = await buildService();
    login.mockRejectedValueOnce(new Error('Geçersiz kullanıcı adı/şifre'));
    const res = await service.testConnection();
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Geçersiz');
  });
});

describe('StubElogoSoapClient', () => {
  function stub(values: Record<string, string> = {}): StubElogoSoapClient {
    return new StubElogoSoapClient(fakeConfig(values));
  }
  const opts = { timeoutMs: 1000 };

  it('login her çağrıda artan session verir (G; önekli)', async () => {
    const client = stub();
    expect((await client.login(opts)).sessionId).toBe('G;stub-session-1');
    expect((await client.login(opts)).sessionId).toBe('G;stub-session-2');
  });

  it('checkUser ELOGO_STUB_EINVOICE_VKNS listesine göre karar verir', async () => {
    const client = stub({ ELOGO_STUB_EINVOICE_VKNS: '1234567890, 9999999999' });
    const res = await client.checkUser(['1234567890', '11111111111'], 's', opts);
    expect(res[0].isEInvoiceUser).toBe(true);
    expect(res[0].eInvoicePkAlias).toBeDefined();
    expect(res[1].isEInvoiceUser).toBe(false);
  });

  it('sendDocument gönderilen belgeyi kaydeder', async () => {
    const client = stub();
    await client.sendDocument(
      { documentType: 'EARCHIVE', documentUuid: 'u1', ublXml: '<Invoice/>' },
      's',
      opts,
    );
    expect(client.sentDocuments).toHaveLength(1);
    expect(client.sentDocuments[0].documentUuid).toBe('u1');
  });

  it('ELOGO_STUB_THROW=TIMEOUT teknik hata fırlatır', async () => {
    const client = stub({ ELOGO_STUB_THROW: 'TIMEOUT' });
    await expect(client.login(opts)).rejects.toThrow('ETIMEDOUT');
  });
});
