import { getMessages, locales } from "@tarodan/i18n";
import { NotificationType } from "../dto";
import { PICTOGRAPH } from "../../../common/helpers/pictograph";
import { NOTIFICATION_TEMPLATES } from "./notification-templates";

/**
 * User-facing notification copy carries no emoji or pictograph icons. The
 * catalog-wide rule is enforced by `packages/i18n/scripts/check-catalog.mjs`.
 */

const lookup = (catalog: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalog,
    );

describe("notification templates without pictographs", () => {
  const entries = Object.entries(NOTIFICATION_TEMPLATES);

  it("the boost ending-soon reminder has its catalog keys and no icon", () => {
    expect(NOTIFICATION_TEMPLATES[NotificationType.BOOST_ENDING_SOON]).toEqual({
      titleKey: "server.notification.boostEndingSoon.title",
      messageKey: "server.notification.boostEndingSoon.message",
    });
  });

  it("no template carries an icon", () => {
    for (const [type, template] of entries) {
      expect({ type, hasIcon: "icon" in template }).toEqual({
        type,
        hasIcon: false,
      });
    }
  });

  it.each(locales)("every %s title and message holds no emoji", (locale) => {
    const catalog = getMessages(locale);
    for (const [, template] of entries) {
      for (const key of [template.titleKey, template.messageKey]) {
        const text = lookup(catalog, key);
        expect(typeof text).toBe("string");
        expect(text).not.toMatch(PICTOGRAPH);
      }
    }
  });
});
