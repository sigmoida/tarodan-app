import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SuratCargoService, SURAT_SOAP_CLIENT } from './surat-cargo.service';
import { CacheService } from '../cache/cache.service';
import type {
  SuratBusinessFailure,
  SuratGonderiPayload,
  SuratTechnicalFailure,
} from './surat-cargo.types';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from './surat-cargo.types';

const basePayload: SuratGonderiPayload = {
  KisiKurum: 'Ali Veli',
  AliciAdresi: 'Atatürk Cad. No:5',
  Il: 'İstanbul',
  Ilce: 'Kadıköy',
  TelefonCep: '05551234567',
  KargoTuru: SuratKargoTuru.Koli,
  Odemetipi: SuratOdemeTipi.Pesin,
  OzelKargoTakipNo: 'ORD-1',
  Adet: 1,
  BirimDesi: 1,
  BirimKg: 1,
  TasimaSekli: SuratTasimaSekli.KaraYolu,
  TeslimSekli: SuratTeslimSekli.AdreseTeslim,
  GonderiSekli: SuratGonderiSekli.Standart,
  Pazaryerimi: 0,
  Iademi: 0,
};

describe('SuratCargoService', () => {
  let service: SuratCargoService;
  let soapCall: jest.Mock;
  let cacheGet: jest.Mock;
  let cacheSet: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(async () => {
    soapCall = jest.fn().mockResolvedValue('Tamam');
    cacheGet = jest.fn().mockResolvedValue(null);
    cacheSet = jest.fn().mockResolvedValue(undefined);
    configGet = jest.fn((key: string, defaultValue?: string) => {
      if (key === 'SURAT_CARGO_MAX_RETRIES') return '3';
      if (key === 'SURAT_CARGO_RETRY_BASE_MS') return '1';
      if (key === 'SURAT_SOAP_TIMEOUT_MS') return '5000';
      return defaultValue;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuratCargoService,
        { provide: SURAT_SOAP_CLIENT, useValue: { callGonderiyiKargoyaGonderYeni: soapCall } },
        { provide: CacheService, useValue: { get: cacheGet, set: cacheSet } },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(SuratCargoService);
  });

  it('returns success only when response is exactly Tamam (trimmed)', async () => {
    soapCall.mockResolvedValue('Tamam');
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k1',
      correlationId: 'c1',
      payload: basePayload,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.suratMessage).toBe('Tamam');
    expect(cacheSet).toHaveBeenCalled();
  });

  it('treats non-Tamam string as business failure', async () => {
    soapCall.mockResolvedValue('Kullanıcı adı veya şifre hatalı');
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k2',
      correlationId: 'c2',
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    const b = r as SuratBusinessFailure;
    expect(b.kind).toBe('business');
    expect(b.suratMessage).toContain('hatalı');
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('EMPTY_RESPONSE for blank SOAP result', async () => {
    soapCall.mockResolvedValue('   ');
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k3',
      correlationId: 'c3',
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe('EMPTY_RESPONSE');
  });

  it('classifies HTTP 500 as HTTP_5XX', async () => {
    const err = new Error('Internal');
    (err as any).statusCode = 500;
    soapCall.mockRejectedValue(err);
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k4b',
      correlationId: 'c4b',
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe('HTTP_5XX');
  });

  it('classifies ETIMEDOUT as TIMEOUT', async () => {
    const err = new Error('timed out');
    (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    soapCall.mockRejectedValue(err);
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k4',
      correlationId: 'c4',
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    expect((r as SuratTechnicalFailure).code).toBe('TIMEOUT');
  });

  it('returns cached success without calling SOAP again', async () => {
    cacheGet.mockResolvedValue({
      ok: true,
      suratMessage: 'Tamam',
      correlationId: 'old',
      idempotencyKey: 'idem',
    });
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'idem',
      correlationId: 'new-corr',
      payload: basePayload,
    });
    expect(r.ok).toBe(true);
    expect(soapCall).not.toHaveBeenCalled();
  });

  it('retries technical failure then succeeds', async () => {
    let n = 0;
    soapCall.mockImplementation(async () => {
      n += 1;
      if (n < 2) {
        const e = new Error('e');
        (e as NodeJS.ErrnoException).code = 'ECONNRESET';
        throw e;
      }
      return 'Tamam';
    });
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k5',
      correlationId: 'c5',
      payload: basePayload,
    });
    expect(r.ok).toBe(true);
    expect(soapCall).toHaveBeenCalledTimes(2);
  });

  it('does not retry business failure', async () => {
    soapCall.mockResolvedValue('Adres eksik');
    const r = await service.submitShipmentWithRetry({
      idempotencyKey: 'k6',
      correlationId: 'c6',
      payload: basePayload,
    });
    expect(r.ok).toBe(false);
    expect(soapCall).toHaveBeenCalledTimes(1);
  });
});
