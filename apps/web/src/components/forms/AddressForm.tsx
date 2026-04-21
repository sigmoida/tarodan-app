'use client';

import React from 'react';
import { Input, Textarea } from '@tarodan/ui';
import CityDistrictSelector from '@/components/CityDistrictSelector';
import { PhoneInput } from './PhoneInput';
import { DEFAULT_COUNTRY_CODE } from '@/lib/phone';

export interface AddressFormValue {
  title?: string;
  fullName: string;
  phone: string;
  phoneCountryCode: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
}

export interface AddressFormProps {
  value: AddressFormValue;
  onChange: (next: AddressFormValue) => void;
  /** Başlık alanı gösterilsin mi? (Billing için genelde gerekmez) */
  showTitle?: boolean;
  /** Zorunlu mu? */
  required?: boolean;
  /** Telefon input disabled mı? (profile senaryoları) */
  disabled?: boolean;
  /** i18n placeholder'ları */
  labels?: {
    title?: string;
    fullName?: string;
    city?: string;
    district?: string;
    address?: string;
  };
  /** Textarea satır sayısı (varsayılan 3). */
  addressRows?: number;
  className?: string;
}

const defaultLabels: Required<NonNullable<AddressFormProps['labels']>> = {
  title: 'Adres Başlığı (örn: Ev, İş)',
  fullName: 'Ad Soyad *',
  city: 'Şehir seçin *',
  district: 'İlçe seçin *',
  address: 'Açık adres *',
};

/**
 * Tek noktadan yönetilen adres formu. checkout, register/business,
 * profile/addresses — hepsi bu bileşeni tüketir.
 */
export const AddressForm: React.FC<AddressFormProps> = ({
  value,
  onChange,
  showTitle = true,
  required,
  disabled,
  labels,
  addressRows = 3,
  className,
}) => {
  const l = { ...defaultLabels, ...labels };
  const set = <K extends keyof AddressFormValue>(key: K, v: AddressFormValue[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className={`space-y-4 ${className ?? ''}`.trim()}>
      {showTitle && (
        <Input
          type="text"
          placeholder={l.title}
          value={value.title ?? ''}
          onChange={(e) => set('title', e.target.value)}
          disabled={disabled}
          className="rounded-[4px]"
        />
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          type="text"
          placeholder={l.fullName}
          value={value.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          required={required}
          disabled={disabled}
          className="rounded-[4px]"
        />
        <PhoneInput
          countryCode={value.phoneCountryCode || DEFAULT_COUNTRY_CODE}
          onCountryCodeChange={(code) => set('phoneCountryCode', code)}
          phone={value.phone}
          onPhoneChange={(phone) => set('phone', phone)}
          required={required}
          disabled={disabled}
        />
      </div>

      <CityDistrictSelector
        city={value.city}
        district={value.district}
        onCityChange={(city) => onChange({ ...value, city, district: '' })}
        onDistrictChange={(district) => set('district', district)}
        cityPlaceholder={l.city}
        districtPlaceholder={l.district}
      />

      <Textarea
        placeholder={l.address}
        rows={addressRows}
        value={value.address}
        onChange={(e) => set('address', e.target.value)}
        required={required}
        disabled={disabled}
        className="input"
      />
    </div>
  );
};

export default AddressForm;
