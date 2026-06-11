/**
 * Saf validasyon kuralları (B katmanı). Form/UI yok — şema doğrudan test edilir.
 * J41: şifre kuralları · J42: 18 yaş kuralı.
 */
import { strongPasswordSchema, isAdult, displayNameSchema, emailSchema } from '../validation';

describe('J41 · şifre kuralları (strongPasswordSchema)', () => {
  it('8 karakterden kısa reddedilir', () => {
    const r = strongPasswordSchema.safeParse('Ab1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Şifre en az 8 karakter olmalı');
  });

  it('büyük harfsiz reddedilir', () => {
    const r = strongPasswordSchema.safeParse('demo1234');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('En az 1 büyük harf içermeli');
  });

  it('rakamsız reddedilir', () => {
    const r = strongPasswordSchema.safeParse('Demoabcd');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('En az 1 rakam içermeli');
  });

  it('güçlü şifre kabul edilir', () => {
    expect(strongPasswordSchema.safeParse('Demo1234').success).toBe(true);
  });
});

describe('J42 · 18 yaş kuralı (isAdult)', () => {
  it('18 yaşından küçük doğum tarihi false', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    expect(isAdult(d.toISOString().slice(0, 10))).toBe(false);
  });

  it('18 yaş ve üstü true', () => {
    expect(isAdult('1990-01-01')).toBe(true);
  });

  it('geçersiz tarih false', () => {
    expect(isAdult('not-a-date')).toBe(false);
  });
});

describe('yardımcı şemalar', () => {
  it('2 karakterden kısa ad reddedilir', () => {
    expect(displayNameSchema.safeParse('A').success).toBe(false);
  });
  it('geçersiz email reddedilir', () => {
    expect(emailSchema.safeParse('bad').success).toBe(false);
  });
});
