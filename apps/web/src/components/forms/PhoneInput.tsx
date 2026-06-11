'use client';

import React from 'react';
import { Input, Select } from '@tarodan/ui';
import {
  countryCodes,
  DEFAULT_COUNTRY_CODE,
  formatPhoneNumber,
  getPhoneMaxLength,
  getPhonePlaceholder,
} from '@/lib/phone';

export interface PhoneInputProps {
  /** Ülke kodu (ör. "+90"). */
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** Lokal numara (ör. "5XX XXX XX XX"). */
  phone: string;
  onPhoneChange: (phone: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Container sınıfı. */
  className?: string;
}

/**
 * Ülke kodu Select + telefon Input combo'su. Tüm uygulamada tek kaynak —
 * formatlama, maxLength ve placeholder otomatik yönetilir.
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  countryCode,
  onCountryCodeChange,
  phone,
  onPhoneChange,
  placeholder,
  required,
  disabled,
  className,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    let cursor = e.target.selectionStart ?? raw.length;

    // Backspace formatlama boşluğunu sildiyse (rakamlar aynı kaldı) öncesindeki
    // rakamı da sil; yoksa formatlayıcı boşluğu geri ekler ve tuş "takılır".
    const digitsOf = (s: string) => s.replace(/\D/g, '');
    if (raw.length < phone.length && digitsOf(raw) === digitsOf(phone) && cursor > 0) {
      raw = raw.slice(0, cursor - 1) + raw.slice(cursor);
      cursor -= 1;
    }

    const formatted = formatPhoneNumber(raw, countryCode);
    onPhoneChange(formatted);

    // Controlled değer yeniden yazılınca imleç sona zıplar; imleci, silinen/yazılan
    // rakamdan sonraki eşdeğer konuma geri taşı (ortadan düzenleme için).
    const digitsBefore = digitsOf(raw.slice(0, cursor)).length;
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[pos])) seen += 1;
      pos += 1;
    }
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el && document.activeElement === el) el.setSelectionRange(pos, pos);
    });
  };

  // Tek çerçeveli combo: border/ring dış wrapper'da, içeride bare select + input.
  // Ayrı border'lı iki kontrol bitişik durunca focus ring'i komşunun üstüne
  // taşıyordu (mobilde input box "+90"ın üzerine biniyordu).
  return (
    <div
      className={[
        'flex w-full items-center rounded-[4px] border border-border bg-surface-elevated transition-colors',
        'focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 focus-within:ring-offset-1',
        disabled ? 'cursor-not-allowed opacity-50 bg-surface' : '',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <Select
        value={countryCode}
        onChange={(e) => onCountryCodeChange(e.target.value)}
        disabled={disabled}
        className="w-auto shrink-0 border-0 bg-surface-alt rounded-[4px] rounded-r-none cursor-pointer focus:ring-0 focus:ring-offset-0 disabled:opacity-100"
      >
        {countryCodes.map((cc) => (
          <option key={cc.code} value={cc.code}>
            {cc.code} {cc.country}
          </option>
        ))}
      </Select>
      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />
      <Input
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={phone}
        onChange={handleChange}
        placeholder={placeholder ?? getPhonePlaceholder(countryCode)}
        maxLength={getPhoneMaxLength(countryCode)}
        required={required}
        disabled={disabled}
        className="min-w-0 flex-1 border-0 bg-transparent rounded-[4px] rounded-l-none focus:ring-0 focus:ring-offset-0 disabled:opacity-100"
      />
    </div>
  );
};

PhoneInput.defaultProps = {
  countryCode: DEFAULT_COUNTRY_CODE,
};

export default PhoneInput;
