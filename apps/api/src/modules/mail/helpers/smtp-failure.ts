/**
 * Bir gönderici kutusunun gönderim hatası KUTUNUN kendisinden mi geliyor?
 *
 * Evet ise (oturum reddedildi, sunucuya bağlanılamadı, TLS kurulamadı, sunucu
 * From adresini bu kullanıcıya ait saymadı) e-posta varsayılan kimlikle
 * yeniden gönderilir ve kutu "hatalı" işaretlenir: yanlış girilmiş bir şifre
 * yüzünden müşteri postası düşmez.
 *
 * Hayır ise (alıcı reddedildi, içerik reddedildi) varsayılan kimlik de aynı
 * cevabı alacağı için yeniden denenmez; hata olduğu gibi döner.
 *
 * nodemailer hataları `code` (EAUTH, ECONNECTION…) ve başarısız SMTP komutunu
 * (`command`: "AUTH PLAIN", "CONN", "MAIL FROM", "RCPT TO", "DATA") taşır.
 */
const ACCOUNT_FAILURE_CODES = new Set([
  "EAUTH",
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ETLS",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
]);

const ACCOUNT_FAILURE_COMMAND = /^(AUTH|CONN|EHLO|HELO|STARTTLS|MAIL FROM)/i;

export function isSenderAccountFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, command } = error as { code?: unknown; command?: unknown };
  if (typeof code === "string" && ACCOUNT_FAILURE_CODES.has(code)) return true;
  return typeof command === "string" && ACCOUNT_FAILURE_COMMAND.test(command);
}

/** Admin ekranında gösterilecek kısa, tek satır hata metni. */
export function describeSmtpError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
