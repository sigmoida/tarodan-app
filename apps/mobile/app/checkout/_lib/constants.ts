import { DEFAULT_COUNTRY_CODE } from '@/utils/phone';
import type { ShippingAddressInput } from './types';

export const STOCKOUT_KEYWORDS = [
  'satışta değil',
  'stokta yok',
  'başkası tarafından',
  'başka alıcıya satıldı',
  'stokta bulunmamaktadır',
];

/** Checkout idempotency anahtarı (RFC4122 v4; sunucu çift submit'i bununla dedupe eder). */
export const generateUuidV4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export const EMPTY_ADDRESS: ShippingAddressInput = {
  fullName: '',
  phone: '',
  phoneCountryCode: DEFAULT_COUNTRY_CODE,
  city: '',
  district: '',
  address: '',
  zipCode: '',
};
