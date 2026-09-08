/**
 * İade denemesinin idempotency anahtarından TALEP kimliği.
 *
 * `RefundAttempt.idempotencyKey` iade talebinden türetilir (`refund-request:<id>`)
 * ve e-belge yolunun talebe (dolayısıyla kusur tarafına ve finansal bileşenlere)
 * ulaşabildiği tek köprüdür. Ters kayıt ile ceza faturası bu türetmeyi PAYLAŞIR:
 * iki yerde ayrı ayrı yazılırsa biri önekin değiştiğini kaçırır.
 */
export const REFUND_REQUEST_KEY_PREFIX = "refund-request:";

export function refundRequestIdOf(
  idempotencyKey: string | null | undefined,
): string | undefined {
  return idempotencyKey?.startsWith(REFUND_REQUEST_KEY_PREFIX)
    ? idempotencyKey.slice(REFUND_REQUEST_KEY_PREFIX.length)
    : undefined;
}
