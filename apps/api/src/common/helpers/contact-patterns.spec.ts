import {
  EMAIL_PATTERN_SOURCE,
  TR_MOBILE_PHONE_PATTERN_SOURCE,
} from "./contact-patterns";
import { ContentFilterService } from "../../modules/messaging/content-filter.service";

/**
 * Ortak iletişim kalıpları: mesajlaşma filtresi ve UAT maskelemesi AYNI
 * yazımları tanır (biri tanıyıp öteki tanımazsa filtreden kaçan numara
 * maskeden de kaçardı).
 */
describe("TR_MOBILE_PHONE_PATTERN_SOURCE", () => {
  const find = (text: string) =>
    text.match(new RegExp(TR_MOBILE_PHONE_PATTERN_SOURCE, "g"));

  it.each([
    "05321234567",
    "5321234567",
    "+905321234567",
    "0532 123 45 67",
    "0 532 123 45 67",
    "0532.123.45.67",
    "0532-123-45-67",
    "(0532) 123 45 67",
    "0(532) 123 4567",
    "+90 (532) 123 45 67",
    "90 532 123 45 67",
  ])("matches %s as one phone number", (phone) => {
    expect(find(`tel: ${phone}.`)).toEqual([phone]);
  });

  it.each(["1053212345678", "ORD-10023", "532 TL", "12.03.2026"])(
    "does not match %s",
    (text) => {
      expect(find(text)).toBeNull();
    },
  );
});

describe("content filter uses the shared patterns", () => {
  it("builtin phone and e-mail patterns are the shared sources", () => {
    const service = new ContentFilterService({} as never, {} as never);
    const builtin = service.getBuiltinPatterns();
    expect(builtin).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "phone",
          pattern: TR_MOBILE_PHONE_PATTERN_SOURCE,
        }),
        expect.objectContaining({
          type: "email",
          pattern: EMAIL_PATTERN_SOURCE,
        }),
      ]),
    );
  });
});
