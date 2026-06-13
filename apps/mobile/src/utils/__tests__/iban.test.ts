import { normalizeIban, isValidTrIban, formatIbanDisplay } from '../iban';

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    expect(normalizeIban('tr12 0006 2000 0000 0000 0000 00')).toBe('TR120006200000000000000000');
  });
  it('handles empty string', () => {
    expect(normalizeIban('')).toBe('');
  });
});

describe('isValidTrIban', () => {
  it('accepts a checksum-valid TR IBAN with spaces', () => {
    expect(isValidTrIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
  });
  it('accepts a checksum-valid normalized TR IBAN', () => {
    expect(isValidTrIban('TR330006100519786457841326')).toBe(true);
  });
  it('rejects a format-valid but checksum-invalid IBAN (typo)', () => {
    expect(isValidTrIban('TR120006200000000000000000')).toBe(false);
    // doğru IBAN'ın tek hanesi bozulmuş hali — mod-97 yakalar
    expect(isValidTrIban('TR330006100519786457841327')).toBe(false);
  });
  it('rejects too-short IBAN', () => {
    expect(isValidTrIban('TR1200062000')).toBe(false);
  });
  it('rejects non-TR IBAN', () => {
    expect(isValidTrIban('DE12000620000000000000000000')).toBe(false);
  });
  it('rejects letters after TR', () => {
    expect(isValidTrIban('TRX20006200000000000000000')).toBe(false);
  });
});

describe('formatIbanDisplay', () => {
  it('groups into blocks of 4 separated by spaces', () => {
    expect(formatIbanDisplay('TR120006200000000000000000')).toBe('TR12 0006 2000 0000 0000 0000 00');
  });
  it('formats partial input as the user types', () => {
    expect(formatIbanDisplay('tr1200')).toBe('TR12 00');
  });
});
