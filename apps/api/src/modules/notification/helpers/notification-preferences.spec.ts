import {
  categoryForType,
  resolveSettings,
  shouldDeliver,
} from "./notification-preferences";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
} from "../../user/dto/notification-settings.dto";
import { NotificationType } from "../dto/notification.dto";

const withPrefs = (
  overrides: Partial<NotificationSettings>,
): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...overrides,
});

describe("notification-preferences", () => {
  describe("categoryForType", () => {
    it("maps message / wishlist / listing / marketing types to categories", () => {
      expect(categoryForType(NotificationType.NEW_MESSAGE)).toBe(
        "messageAlerts",
      );
      expect(categoryForType(NotificationType.PRICE_DROP)).toBe(
        "priceDropAlerts",
      );
      expect(categoryForType(NotificationType.BACK_IN_STOCK)).toBe(
        "priceDropAlerts",
      );
      expect(categoryForType("wishlist_item_sold")).toBe("priceDropAlerts");
      expect(categoryForType(NotificationType.SELLER_NEW_LISTING)).toBe(
        "newListingAlerts",
      );
      expect(categoryForType(NotificationType.PROMOTION)).toBe(
        "marketingEmails",
      );
      expect(categoryForType(NotificationType.SPECIAL_OFFER)).toBe(
        "marketingEmails",
      );
    });

    it("maps commerce-flow types (order/offer/trade/refund/payment) to orderUpdates", () => {
      expect(categoryForType(NotificationType.ORDER_SHIPPED)).toBe(
        "orderUpdates",
      );
      expect(categoryForType(NotificationType.OFFER_RECEIVED)).toBe(
        "orderUpdates",
      );
      expect(categoryForType(NotificationType.TRADE_ACCEPTED)).toBe(
        "orderUpdates",
      );
      expect(categoryForType(NotificationType.REFUND_APPROVED)).toBe(
        "orderUpdates",
      );
      expect(categoryForType(NotificationType.PAYMENT_RECEIVED)).toBe(
        "orderUpdates",
      );
    });

    it("returns null for uncategorized types (social/membership/etc.)", () => {
      expect(categoryForType(NotificationType.NEW_FOLLOWER)).toBeNull();
      expect(categoryForType(NotificationType.REVIEW_RECEIVED)).toBeNull();
      expect(categoryForType(NotificationType.PRODUCT_SOLD)).toBeNull();
    });

    it("admin operasyon alarmları önek eşlemesinden muaftır — tercih susturamaz", () => {
      // order/trade/refund önekleri bu tipleri orderUpdates'e düşürüyordu:
      // orderUpdates'i kapatan bir admin "escrow takıldı / depo takıldı /
      // iade incelemesi bekliyor" alarmlarını tamamen susturabiliyordu.
      expect(
        categoryForType(NotificationType.ORDER_STUCK_IN_TRANSIT),
      ).toBeNull();
      expect(
        categoryForType(NotificationType.TRADE_STUCK_AT_WAREHOUSE),
      ).toBeNull();
      expect(
        categoryForType(NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING),
      ).toBeNull();
      expect(
        categoryForType(NotificationType.REFUND_REVIEW_REQUIRED_ADMIN),
      ).toBeNull();
    });
  });

  describe("resolveSettings", () => {
    it("returns defaults for null/undefined", () => {
      expect(resolveSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
      expect(resolveSettings(undefined)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    });

    it("merges partial stored prefs over defaults", () => {
      expect(resolveSettings({ messageAlerts: false })).toEqual(
        withPrefs({ messageAlerts: false }),
      );
    });
  });

  describe("shouldDeliver", () => {
    it("delivers everything with default prefs", () => {
      const s = DEFAULT_NOTIFICATION_SETTINGS;
      expect(shouldDeliver(s, NotificationType.NEW_MESSAGE, "push")).toBe(true);
      expect(shouldDeliver(s, NotificationType.NEW_MESSAGE, "in_app")).toBe(
        true,
      );
      expect(shouldDeliver(s, NotificationType.ORDER_SHIPPED, "push")).toBe(
        true,
      );
    });

    it("Bulgu #9: messageAlerts off suppresses NEW_MESSAGE on push AND in-app (bell)", () => {
      const s = withPrefs({ messageAlerts: false });
      expect(shouldDeliver(s, NotificationType.NEW_MESSAGE, "push")).toBe(
        false,
      );
      expect(shouldDeliver(s, NotificationType.NEW_MESSAGE, "in_app")).toBe(
        false,
      );
      expect(shouldDeliver(s, NotificationType.NEW_MESSAGE, "email")).toBe(
        false,
      );
      // diğer kategoriler etkilenmez
      expect(shouldDeliver(s, NotificationType.ORDER_SHIPPED, "push")).toBe(
        true,
      );
    });

    it("push master off suppresses push but keeps the in-app bell", () => {
      const s = withPrefs({ pushNotifications: false });
      expect(shouldDeliver(s, NotificationType.ORDER_SHIPPED, "push")).toBe(
        false,
      );
      expect(shouldDeliver(s, NotificationType.ORDER_SHIPPED, "in_app")).toBe(
        true,
      );
    });

    it("email/sms masters gate only their channel", () => {
      expect(
        shouldDeliver(
          withPrefs({ emailNotifications: false }),
          NotificationType.ORDER_SHIPPED,
          "email",
        ),
      ).toBe(false);
      expect(
        shouldDeliver(
          withPrefs({ emailNotifications: false }),
          NotificationType.ORDER_SHIPPED,
          "push",
        ),
      ).toBe(true);
      expect(
        shouldDeliver(
          withPrefs({ smsNotifications: false }),
          NotificationType.ORDER_SHIPPED,
          "sms",
        ),
      ).toBe(false);
    });

    it("always-send types ignore all preferences", () => {
      const s = withPrefs({
        pushNotifications: false,
        emailNotifications: false,
        smsNotifications: false,
      });
      expect(shouldDeliver(s, NotificationType.PASSWORD_RESET, "email")).toBe(
        true,
      );
      expect(
        shouldDeliver(s, NotificationType.EMAIL_VERIFICATION, "email"),
      ).toBe(true);
      expect(shouldDeliver(s, "admin_broadcast", "push")).toBe(true);
    });
  });
});
