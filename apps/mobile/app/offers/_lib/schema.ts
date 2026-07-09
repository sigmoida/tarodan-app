// Karşı teklif modallarının zod şemaları (colocated).
// Sınırlar runtime'da (mevcut teklif tutarı / ürün fiyatı) belli olduğundan
// şemalar bir factory ile üretilir. Form değerleri string girer (`z.input`),
// `handleSubmit` sayı üretir (`z.output`).
import { z } from 'zod';
import { formatPrice } from './status';

const amount = z
  .string()
  .trim()
  .transform((s) => parseFloat(s.replace(',', '.')))
  .refine((n) => !Number.isNaN(n) && n > 0, 'Geçerli bir tutar girin');

/**
 * Satıcının karşı teklifi: mevcut tekliften YÜKSEK, ürün fiyatından
 * (varsa) DÜŞÜK/eşit olmalı.
 */
export function sellerCounterSchema(refAmount: number, maxPrice: number) {
  return z.object({
    amount: amount
      .refine(
        (n) => n > refAmount,
        `Karşı teklif, mevcut tekliften (${formatPrice(refAmount)}) yüksek olmalıdır`,
      )
      .refine(
        (n) => maxPrice <= 0 || n <= maxPrice,
        `Karşı teklif, ürün fiyatından (${formatPrice(maxPrice)}) yüksek olamaz`,
      ),
  });
}

/** Alıcının karşı teklifi (satıcının counter'ından sonra): satıcı tutarından DÜŞÜK. */
export function buyerCounterSchema(refAmount: number) {
  return z.object({
    amount: amount.refine(
      (n) => n < refAmount,
      `Satıcının karşı teklifi ${formatPrice(refAmount)}. Yeni tutar bundan düşük olmalıdır.`,
    ),
  });
}

export type SellerCounterInput = z.input<ReturnType<typeof sellerCounterSchema>>;
export type BuyerCounterInput = z.input<ReturnType<typeof buyerCounterSchema>>;
