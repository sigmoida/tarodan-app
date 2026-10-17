import { api } from "./client";

/**
 * `GET /admin/settings/public` yanıtı (herkese açık platform ayarları, sayı
 * olarak). Fiyat sınırı anahtarları ayar boşsa yanıtta HİÇ bulunmaz.
 */
export interface PublicSettings {
  max_message_length?: number;
  min_product_price?: number;
  max_product_price?: number;
  [key: string]: number | undefined;
}

export const publicSettingsApi = {
  get: () => api.get<PublicSettings>("/admin/settings/public"),
};
