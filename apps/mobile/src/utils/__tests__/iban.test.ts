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
  it('accepts a 26-char TR IBAN with spaces', () => {
    expect(isValidTrIban('TR12 0006 2000 0000 0000 0000 00')).toBe(true);
  });
  it('accepts a normalized 26-char TR IBAN', () => {
    expect(isValidTrIban('TR120006200000000000000000')).toBe(true);
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
