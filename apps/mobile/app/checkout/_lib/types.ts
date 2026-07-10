export interface ShippingAddressInput {
  fullName: string;
  phone: string;
  /** UI'da seçilen ülke kodu — payload'a phone prefix'i olarak gömülür, ayrıca gönderilmez. */
  phoneCountryCode?: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
}

export interface SavedAddress {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
  isDefault?: boolean;
}
