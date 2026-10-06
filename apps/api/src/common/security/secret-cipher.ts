import * as crypto from "crypto";

/**
 * Durağan sır şifrelemesi — TEK uygulama. AES-256-GCM, biçim
 * `v1:<iv>:<tag>:<ciphertext>` (base64 parçalar).
 *
 * Kullananlar her biri KENDİ anahtarıyla gelir: 2FA sırları
 * `TWO_FACTOR_ENCRYPTION_KEY`, gönderici posta kutusu şifreleri
 * `MAIL_ACCOUNT_ENCRYPTION_KEY`. Anahtar malzemesi (env değeri) SHA-256 ile 32
 * bayta indirilir; biri sızarsa ya da döndürülürse öbürü etkilenmez.
 *
 * GCM etiketi bütünlüğü doğrular: yanlış anahtar ya da bozulmuş metin
 * `decryptSecret`te fırlatır, sessizce çöp döndürmez.
 */

export const SECRET_CIPHER_PREFIX = "v1:";

/** Env değerinden (herhangi uzunluk) 32 baytlık AES anahtarı. */
export function deriveSecretKey(material: string): Buffer {
  return crypto.createHash("sha256").update(material).digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_CIPHER_PREFIX);
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${SECRET_CIPHER_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(encrypted: string, key: Buffer): string {
  if (!isEncryptedSecret(encrypted)) {
    throw new Error("Unsupported encrypted secret format");
  }
  const [, iv, tag, ciphertext] = encrypted.split(":");
  if (!iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted secret");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
