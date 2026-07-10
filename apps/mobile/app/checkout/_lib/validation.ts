import type { ShippingAddressInput } from './types';

export const extractApiMessage = (e: any): string | null => {
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  if (typeof e?.response?.data?.error === 'string') return e.response.data.error;
  return null;
};

export const validateGuest = (name: string, email: string, phone: string): string | null => {
  if (!name.trim()) return 'Lütfen adınızı girin';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Geçerli bir e-posta adresi girin';
  if (phone.replace(/\D/g, '').length < 10) return 'Geçerli bir telefon numarası girin';
  return null;
};

export const validateInlineAddress = (a: ShippingAddressInput, label = 'Teslimat'): string | null => {
  if (!a.fullName.trim()) return `${label} adresi için ad soyad gerekli`;
  if (a.phone.replace(/\D/g, '').length < 10) return `${label} adresi için telefon numarası gerekli`;
  if (!a.city.trim()) return `${label} adresi için il seçin`;
  if (!a.district.trim()) return `${label} adresi için ilçe seçin`;
  if (!a.address.trim()) return `${label} adresi için açık adres girin`;
  return null;
};
