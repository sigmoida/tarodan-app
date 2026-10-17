import { MAIL_AREAS } from "@tarodan/types";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  mailAreaOfTemplate,
  templateKeysByMailArea,
} from "./email-template-registry";

/**
 * Mail Yönlendirme: her müşteri şablonu tam bir alana bağlıdır. Alanı olmayan
 * (ya da sözlükte olmayan alana bağlı) şablon, hangi kutudan çıkacağı belirsiz
 * bir e-posta demektir — sessizce varsayılan kimliğe düşerdi.
 */
describe("email-template-registry — şablon → Mail Yönlendirme alanı", () => {
  it("her şablonun geçerli bir alanı var", () => {
    const missing = EMAIL_TEMPLATE_DEFINITIONS.filter(
      (definition) =>
        !(MAIL_AREAS as readonly string[]).includes(definition.area),
    ).map((definition) => definition.key);

    expect(missing).toEqual([]);
  });

  it("şablon anahtarları benzersiz", () => {
    const keys = EMAIL_TEMPLATE_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("iptal şablonları 'Sipariş'ten ayrılıp cancellation alanına düşer", () => {
    for (const key of [
      "order-cancelled-buyer",
      "order-cancelled-seller",
      "order-cancelled-by-platform-buyer",
      "order-cancelled-by-platform-seller",
    ]) {
      expect(mailAreaOfTemplate(key)).toBe("cancellation");
    }
    const cancelGroups = EMAIL_TEMPLATE_DEFINITIONS.filter(
      (definition) => definition.area === "cancellation",
    ).map((definition) => definition.group);
    expect(new Set(cancelGroups)).toEqual(new Set(["İptal"]));
  });

  it("örnek eşlemeler", () => {
    expect(mailAreaOfTemplate("order-paid")).toBe("order");
    expect(mailAreaOfTemplate("password-reset")).toBe("account");
    expect(mailAreaOfTemplate("refund-completed")).toBe("refund");
    expect(mailAreaOfTemplate("marketing-newsletter")).toBe("marketing");
    expect(mailAreaOfTemplate("elogo-invoice")).toBe("invoice");
    expect(mailAreaOfTemplate("no-such-template")).toBeUndefined();
  });

  it("alan → şablonlar tablosu her alanı içerir ve her şablonu bir kez sayar", () => {
    const byArea = templateKeysByMailArea();

    expect(Object.keys(byArea)).toEqual([...MAIL_AREAS]);
    const flattened = Object.values(byArea).flat();
    expect(flattened.sort()).toEqual(
      EMAIL_TEMPLATE_DEFINITIONS.map((definition) => definition.key).sort(),
    );
    expect(byArea.cancellation).toContain("order-cancelled-buyer");
    expect(byArea.order).not.toContain("order-cancelled-buyer");
  });
});
