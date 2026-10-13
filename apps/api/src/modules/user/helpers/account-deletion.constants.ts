/**
 * Hesap silme transaction'ının üst süresi. Transaction boyunca kullanıcı satırı
 * `FOR UPDATE` kilitli kalır; o satırı kilitleyen başka transaction'lar (ör.
 * Apple token yazımı) en çok bu kadar bekleyebilir — bekleme sürelerini bu
 * değerden türetin, ayrı bir sayı yazmayın.
 */
export const ACCOUNT_DELETION_TX_TIMEOUT_MS = 60_000;
