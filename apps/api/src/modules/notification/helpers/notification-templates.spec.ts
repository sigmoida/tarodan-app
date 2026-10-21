import { getMessages, locales } from "@tarodan/i18n";
import { NotificationType } from "../dto";
import { NOTIFICATION_TEMPLATES } from "./notification-templates";

/**
 * User-facing notification copy carries no emoji or pictograph icons. Pinned
 * here for the boost ending-soon reminder; the older templates are cleaned up
 * separately (with a catalog lint check).
 */

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

const lookup = (catalog: unknown, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalog,
    );

describe("notification templates without pictographs", () => {
  const template = NOTIFICATION_TEMPLATES[NotificationType.BOOST_ENDING_SOON];

  it("the boost ending-soon reminder has its catalog keys and no icon", () => {
    expect(template).toEqual({
      titleKey: "server.notification.boostEndingSoon.title",
      messageKey: "server.notification.boostEndingSoon.message",
    });
  });

  it.each(locales)("its %s title and message hold no emoji", (locale) => {
    const catalog = getMessages(locale);
    for (const key of [template?.titleKey, template?.messageKey]) {
      const text = lookup(catalog, key as string);
      expect(typeof text).toBe("string");
      expect(text).not.toMatch(PICTOGRAPH);
    }
  });
});
