import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PayTRService } from './paytr.service';

describe('PayTRService', () => {
  let service: PayTRService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'PAYTR_MERCHANT_ID') return 'merchant_id_1';
              if (key === 'PAYTR_MERCHANT_KEY') return 'merchant_key_xx';
              if (key === 'PAYTR_MERCHANT_SALT') return 'merchant_salt_yy';
              if (key === 'PAYTR_TEST_MODE') return 'true';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PayTRService);
    fetchSpy = jest.spyOn(global, 'fetch' as never) as unknown as jest.SpyInstance;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parsePaytrMoneyString', () => {
    it('parses Turkish comma decimal', () => {
      expect(PayTRService.parsePaytrMoneyString('10,8')).toBe(10.8);
      expect(PayTRService.parsePaytrMoneyString('99,90')).toBeCloseTo(99.9);
    });

    it('parses dot decimal', () => {
      expect(PayTRService.parsePaytrMoneyString('100.5')).toBe(100.5);
    });
  });

  describe('queryPaymentStatus', () => {
    it('returns success with TL amounts when PayTR responds success', async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: 'success',
            payment_total: '99,90',
            payment_amount: '99,90',
            currency: 'TL',
            payment_date: '2024-01-01 12:00:00',
          }),
      });

      const r = await service.queryPaymentStatus('ORDER123');

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.paymentTotalTl).toBeCloseTo(99.9);
        expect(r.paymentAmountTl).toBeCloseTo(99.9);
        expect(r.currency).toBe('TL');
      }

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.paytr.com/odeme/durum-sorgu',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      expect(body).toContain('merchant_oid=ORDER123');
      expect(body).toMatch(/paytr_token=/);
    });

    it('returns ok false on PayTR error status', async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: 'error',
            err_no: '004',
            err_msg: 'Failed to find successful payment with merchant_oid',
          }),
      });

      const r = await service.queryPaymentStatus('missing');
      expect(r.ok).toBe(false);
      if (r.ok === false) {
        expect(r.errMsg).toContain('merchant_oid');
      }
    });
  });
});
