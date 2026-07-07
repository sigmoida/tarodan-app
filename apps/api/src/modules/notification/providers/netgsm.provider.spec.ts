import { ConfigService } from '@nestjs/config';
import { NetGsmProvider } from './netgsm.provider';

function makeProvider(env: Record<string, string> = {}) {
  const config = { get: (k: string, d?: any) => (k in env ? env[k] : d) } as unknown as ConfigService;
  return new NetGsmProvider(config);
}

describe('NetGsmProvider', () => {
  describe('toNetgsmNumber', () => {
    it('E.164 numarayı 90 öneki ile dönüştürür', () => {
      const p = makeProvider();
      expect(p.toNetgsmNumber('+905551234567')).toBe('905551234567');
    });
    it('yerel 0 formatını dönüştürür', () => {
      const p = makeProvider();
      expect(p.toNetgsmNumber('05551234567')).toBe('905551234567');
    });
  });

  describe('mapResponseCode', () => {
    it('00 başarıdır', () => {
      expect(makeProvider().mapResponseCode('00').success).toBe(true);
    });
    it('40 onaysız başlık hatasıdır', () => {
      const r = makeProvider().mapResponseCode('40');
      expect(r.success).toBe(false);
      expect(r.error).toContain('başlık');
    });
    it('30 kimlik hatasıdır', () => {
      expect(makeProvider().mapResponseCode('30').success).toBe(false);
    });
  });

  describe('sendOtp (config yok)', () => {
    it('env yoksa mock başarı döner ve HTTP çağrısı yapmaz', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as any);
      const p = makeProvider();
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('sendOtp (config var)', () => {
    it('başarılı NetGSM yanıtında success döner', async () => {
      const p = makeProvider({
        NETGSM_USERCODE: 'u',
        NETGSM_PASSWORD: 'p',
        NETGSM_MSGHEADER: 'TARODAN',
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch' as any)
        .mockResolvedValue({ ok: true, json: async () => ({ code: '00', jobid: '123' }) } as any);
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('123');
      fetchSpy.mockRestore();
    });

    it('hata kodunda success false döner', async () => {
      const p = makeProvider({
        NETGSM_USERCODE: 'u',
        NETGSM_PASSWORD: 'p',
        NETGSM_MSGHEADER: 'TARODAN',
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch' as any)
        .mockResolvedValue({ ok: true, json: async () => ({ code: '40' }) } as any);
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(false);
      fetchSpy.mockRestore();
    });
  });
});
