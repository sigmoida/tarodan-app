import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  decryptSecret,
  deriveSecretKey,
  encryptSecret,
} from "../../common/security/secret-cipher";
import { isProduction } from "../../config/environment";

/**
 * Gönderici posta kutusu şifrelerinin durağan şifrelemesi. Şifreleme ortak
 * yardımcıdadır (`common/security/secret-cipher`); burada yalnız ANAHTAR
 * seçilir: `MAIL_ACCOUNT_ENCRYPTION_KEY`.
 *
 * Canlıda anahtar yoksa şifre ne yazılır ne okunur (`isAvailable() === false`):
 * admin kutu kaydedemez, kayıtlı kutular varsayılan kimliğe düşer. Canlı
 * dışında boş anahtar JWT_SECRET'a düşer (2FA ile aynı geliştirme kolaylığı).
 */
@Injectable()
export class MailAccountCipher {
  constructor(private readonly config: ConfigService) {}

  isAvailable(): boolean {
    return this.keyMaterial() !== null;
  }

  encrypt(plaintext: string): string {
    return encryptSecret(plaintext, this.key());
  }

  decrypt(encrypted: string): string {
    return decryptSecret(encrypted, this.key());
  }

  private key(): Buffer {
    const material = this.keyMaterial();
    if (material === null) {
      throw new Error("MAIL_ACCOUNT_ENCRYPTION_KEY is not configured");
    }
    return deriveSecretKey(material);
  }

  private keyMaterial(): string | null {
    const configured = this.config
      .get<string>("MAIL_ACCOUNT_ENCRYPTION_KEY")
      ?.trim();
    if (configured) return configured;
    if (isProduction()) return null;
    return this.config.get<string>("JWT_SECRET")?.trim() || null;
  }
}
