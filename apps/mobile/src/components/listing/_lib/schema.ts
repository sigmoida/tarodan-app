import { z } from 'zod';

/**
 * #81 (hibrit): ListingForm'un TEXT alanları için zod — picker/chip/switch/tarih
 * alanları useState olarak kalır (bkz useListingForm). Sayısal alanlar text input'a
 * bağlı olduğu için string tutulur ve submit'te Number()'a çevrilir → payload
 * byte-byte korunur. Not: title min 5 (web min 1'den farklı, mobil davranışı korunur).
 */
export const listingFormSchema = z.object({
  title: z.string().trim().min(5, 'Başlık en az 5 karakter olmalıdır.'),
  description: z.string().max(5000, 'Açıklama en fazla 5000 karakter olabilir.'),
  price: z
    .string()
    .min(1, 'Geçerli bir fiyat giriniz.')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 1, 'Geçerli bir fiyat giriniz.'),
  quantity: z.string(),
  bundleSize: z.string(),
});

export type ListingFormValues = z.infer<typeof listingFormSchema>;

export const emptyListingFormValues: ListingFormValues = {
  title: '',
  description: '',
  price: '',
  quantity: '1',
  bundleSize: '',
};
