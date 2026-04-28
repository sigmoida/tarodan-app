import { z } from 'zod';

export const addressSchema = z.object({
  title: z.string().min(1, 'Adres başlığı gereklidir').max(50),
  fullName: z.string().min(1, 'Ad soyad gereklidir').max(100),
  phone: z
    .string()
    .min(1, 'Telefon numarası gereklidir')
    .regex(/^[0-9]{10,11}$/, 'Geçerli bir telefon numarası giriniz'),
  addressLine1: z.string().min(1, 'Adres gereklidir').max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, 'İl seçimi gereklidir'),
  district: z.string().min(1, 'İlçe seçimi gereklidir'),
  postalCode: z.string().min(5, 'Posta kodu gereklidir').max(10),
  country: z.string().default('Türkiye'),
});

export const createOrderSchema = z.object({
  productId: z.string().min(1, 'Ürün seçimi gereklidir'),
  quantity: z.number().min(1, 'Miktar en az 1 olmalıdır').max(100),
  shippingAddressId: z.string().min(1, 'Teslimat adresi seçimi gereklidir'),
  notes: z.string().max(500).optional(),
});

export const guestCheckoutSchema = z.object({
  productId: z.string().min(1, 'Ürün seçimi gereklidir'),
  quantity: z.number().min(1, 'Miktar en az 1 olmalıdır').max(100).optional(),
  email: z
    .string()
    .min(1, 'E-posta gereklidir')
    .email('Geçerli bir e-posta adresi giriniz'),
  emailVerificationCode: z.string().regex(/^\d{6}$/, 'Doğrulama kodu 6 haneli olmalıdır'),
  phone: z
    .string()
    .min(1, 'Telefon numarası gereklidir')
    .regex(/^[0-9]{10,11}$/, 'Geçerli bir telefon numarası giriniz'),
  shippingAddress: addressSchema.omit({ title: true }),
});

export const initiatePaymentSchema = z.object({
  orderId: z.string().min(1, 'Sipariş ID gereklidir'),
  method: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'WALLET'], {
    required_error: 'Ödeme yöntemi seçimi gereklidir',
  }),
  returnUrl: z.string().url().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type GuestCheckoutInput = z.infer<typeof guestCheckoutSchema>;
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
