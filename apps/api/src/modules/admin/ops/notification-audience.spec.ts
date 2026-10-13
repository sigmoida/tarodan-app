import {
  MARKETING_CONSENT_WHERE,
  PROMOTION_CANDIDATE_WHERE,
} from "./notification-audience";
import {
  acceptsPromotion,
  categoryForType,
} from "../../notification/helpers/notification-preferences";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../user/dto/notification-settings.dto";
import { NotificationType } from "../../notification/dto/notification.dto";

/**
 * Pazarlama kitle kapıları: push + zil kampanya (PROMOTION) tercihine,
 * e-posta e-posta izni kolonuna bağlıdır. Kampanya kararı gönderim yolundaki
 * (`push.worker`) ile aynı `acceptsPromotion` fonksiyonundan çıkar.
 */
describe("notification-audience — pazarlama kapıları", () => {
  it("e-posta kapısı e-posta izni kolonudur", () => {
    expect(MARKETING_CONSENT_WHERE).toEqual({ acceptsMarketingEmails: true });
  });

  it("kampanya aday kümesi: JSON anahtarı true ya da e-posta izni true", () => {
    const key = categoryForType(NotificationType.PROMOTION);
    expect(key).toBe("marketingEmails");
    expect(PROMOTION_CANDIDATE_WHERE).toEqual({
      OR: [
        { acceptsMarketingEmails: true },
        { notificationSettings: { path: [key], equals: true } },
      ],
    });
  });

  describe("acceptsPromotion", () => {
    it("JSON anahtarı true → alır (kolon ne olursa olsun)", () => {
      expect(acceptsPromotion({ marketingEmails: true }, false)).toBe(true);
      expect(acceptsPromotion({ marketingEmails: true }, null)).toBe(true);
    });

    it("JSON anahtarı false + kolon true → almaz", () => {
      expect(acceptsPromotion({ marketingEmails: false }, true)).toBe(false);
    });

    it("anahtar yok + kolon true → alır", () => {
      expect(acceptsPromotion(null, true)).toBe(true);
      expect(acceptsPromotion({}, true)).toBe(true);
      expect(acceptsPromotion({ orderUpdates: false }, true)).toBe(true);
      expect(acceptsPromotion({ marketingEmails: null }, true)).toBe(true);
    });

    it("anahtar yok + kolon false → almaz", () => {
      expect(acceptsPromotion(null, false)).toBe(false);
      expect(acceptsPromotion({}, false)).toBe(false);
    });

    it("kolon bilinmiyorsa varsayılan (kapalı) geçerlidir", () => {
      expect(DEFAULT_NOTIFICATION_SETTINGS.marketingEmails).toBe(false);
      expect(acceptsPromotion(null, undefined)).toBe(false);
    });
  });
});
