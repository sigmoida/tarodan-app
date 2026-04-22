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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPhoneChange(formatPhoneNumber(e.target.value, countryCode));
  };

  return (
    <div className={`flex ${className ?? ''}`.trim()}>
      <Select
        value={countryCode}
        onChange={(e) => onCountryCodeChange(e.target.value)}
        disabled={disabled}
        className="w-auto bg-surface-alt rounded-r-none border-r-0 cursor-pointer"
      >
        {countryCodes.map((cc) => (
          <option key={cc.code} value={cc.code}>
            {cc.code} {cc.country}
          </option>
        ))}
      </Select>
      <Input
        type="tel"
        value={phone}
        onChange={handleChange}
        placeholder={placeholder ?? getPhonePlaceholder(countryCode)}
        maxLength={getPhoneMaxLength(countryCode)}
        required={required}
        disabled={disabled}
        className="rounded-[4px] rounded-l-none flex-1"
      />
    </div>
  );
};

PhoneInput.defaultProps = {
  countryCode: DEFAULT_COUNTRY_CODE,
};

export default PhoneInput;
