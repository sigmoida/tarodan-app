import { DEFAULT_COUNTRY_CODE } from '../../../../src/utils/phone';

export interface Address {
  id: string;
  title: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  postalCode?: string;
  zipCode?: string; // API bu alanı döndürüyor
  isDefault: boolean;
}

export const EMPTY_FORM = () => ({
  title: '',
  fullName: '',
  phone: '',
  phoneCountryCode: DEFAULT_COUNTRY_CODE,
  address: '',
  city: '',
  district: '',
  postalCode: '',
  isDefault: false,
});

export type AddressForm = ReturnType<typeof EMPTY_FORM>;
