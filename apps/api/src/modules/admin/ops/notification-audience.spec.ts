import {
  MARKETING_CONSENT_WHERE,
  PROMOTION_PREFERENCE_WHERE,
} from "./notification-audience";
import {
  categoryForType,
  resolveSettings,
  shouldDeliver,
  MARKETING_BROADCAST_PREFERENCE_TYPE,
} from "../../notification/helpers/notification-preferences";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../user/dto/notification-settings.dto";
import { NotificationType } from "../../notification/dto/notification.dto";

/**
 * Pazarlama kitle kapıları: push + zil kampanya (PROMOTION) tercihine,
 * e-posta e-posta izni kolonuna bağlıdır. Süzgeç, gönderim yolundaki karar
 * (`shouldDeliver`) ile aynı anahtarı ve aynı varsayılanı kullanmalı.
 */
describe("notification-audience — pazarlama kapıları", () => {
  it("e-posta kapısı e-posta izni kolonudur", () => {
    expect(MARKETING_CONSENT_WHERE).toEqual({ acceptsMarketingEmails: true });
  });

  it("push + zil kapısı kampanya kategorisinin JSON anahtarını okur", () => {
    const key = categoryForType(NotificationType.PROMOTION);
    expect(key).toBe("marketingEmails");
    expect(PROMOTION_PREFERENCE_WHERE).toEqual({
      notificationSettings: { path: [key], equals: true },
    });
  });

  it("süzgeç 'yalnız açıkça true' varsayımı kampanya varsayılanıyla uyumludur", () => {
    // Varsayılan kapalı → kayıtlı tercihi olmayan kullanıcı eşleşmemeli.
    // Varsayılan açılırsa PROMOTION_PREFERENCE_WHERE yeniden yazılmalı.
    expect(DEFAULT_NOTIFICATION_SETTINGS.marketingEmails).toBe(false);
    expect(
      shouldDeliver(
        resolveSettings(null),
        MARKETING_BROADCAST_PREFERENCE_TYPE,
        "push",
      ),
    ).toBe(false);
    expect(
      shouldDeliver(
        resolveSettings({ marketingEmails: true }),
        MARKETING_BROADCAST_PREFERENCE_TYPE,
        "push",
      ),
    ).toBe(true);
  });
});
