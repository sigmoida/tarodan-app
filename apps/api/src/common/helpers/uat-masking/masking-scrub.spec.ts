import { isValidTckn } from "@tarodan/types";
import { isValidTrIban } from "../../validators/tr-iban";
import { classifyJsonKey, scrubFreeText, scrubJson } from "./masking-scrub";

/**
 * Serbest metin ve JSON temizliği: iletişim/kimlik kalıpları sahteye döner,
 * metnin ve JSON'un geri kalanı aynen kalır, ikinci geçiş hiçbir şeyi
 * değiştirmez (yenileme idempotent).
 */
describe("scrubFreeText", () => {
  const message =
    "Merhaba, ahmet.yilmaz@gmail.com ya da 0532 123 45 67 / +905321234567 yazın. " +
    "IBAN: TR33 0006 1005 1978 6457 8413 26, TC 10000000146. Sipariş ORD-10023, 2 adet.";

  it("replaces e-mail, phone, IBAN and checksum-valid TCKN; keeps the rest", () => {
    const out = scrubFreeText(message, "row-1:content");
    expect(out).not.toContain("ahmet.yilmaz@gmail.com");
    expect(out).not.toContain("0532 123 45 67");
    expect(out).not.toContain("+905321234567");
    expect(out).not.toContain("TR33 0006");
    expect(out).not.toContain("10000000146");
    expect(out).toMatch(/u[0-9a-f]{12}@uat\.invalid/);
    expect(out.match(/\+90500\d{7}/g)).toHaveLength(2);
    expect(isValidTrIban(/TR\d{24}/.exec(out)![0])).toBe(true);
    expect(isValidTckn(/TC (\d{11})/.exec(out)![1])).toBe(true);
    expect(out).toContain("Merhaba,");
    expect(out).toContain("Sipariş ORD-10023, 2 adet.");
  });

  it("is idempotent and deterministic", () => {
    const once = scrubFreeText(message, "row-1:content");
    expect(scrubFreeText(once, "row-1:content")).toBe(once);
    expect(scrubFreeText(message, "row-1:content")).toBe(once);
    expect(scrubFreeText(message, "row-2:content")).not.toBe(once);
  });

  it("leaves an 11-digit number that is not a TCKN alone (tracking numbers)", () => {
    expect(scrubFreeText("Takip: 12345678901", "k")).toBe("Takip: 12345678901");
  });

  it("does not mistake digits inside an e-mail for a phone number", () => {
    const out = scrubFreeText("yaz: ali5321234567x@hotmail.com", "k");
    expect(out).toMatch(/^yaz: u[0-9a-f]{12}@uat\.invalid$/);
  });
});

describe("classifyJsonKey", () => {
  it.each([
    ["guestEmail", "email"],
    ["kepAddress", "email"],
    ["user_phone", "phone"],
    ["iban", "iban"],
    ["transferIban", "iban"],
    ["tcKimlikNo", "tckn"],
    ["nationalId", "tckn"],
    ["recipientVknTckn", "taxId"],
    ["taxId", "taxId"],
    ["fullName", "fullName"],
    ["guestName", "fullName"],
    ["accountHolder", "fullName"],
    ["user_name", "username"],
    ["address", "street"],
    ["addressLine", "street"],
    ["zipCode", "drop"],
    ["ipAddress", "drop"],
    ["user_ip", "drop"],
    ["lastLoginIp", "drop"],
    ["paytr_token", "drop"],
    ["passwordHash", "drop"],
    ["birthDate", "birthDate"],
  ])("%s → %s", (key, kind) => {
    expect(classifyJsonKey(key)).toBe(kind);
  });

  it.each([
    "name",
    "city",
    "district",
    "shippingAddressId",
    "addressIds",
    "membershipId",
    "description",
    "orderNumber",
    "stakeholderCount",
    "amount",
  ])("%s is not personal", (key) => {
    expect(classifyJsonKey(key)).toBeNull();
  });
});

describe("scrubJson", () => {
  // Misafir siparişinin `orders.shipping_address` anlık görüntüsü.
  const guestSnapshot = {
    guestName: "Ahmet Yılmaz",
    guestEmail: "ahmet@gmail.com",
    guestPhone: "+905321234567",
    fullName: "Ahmet Yılmaz",
    phone: "+905321234567",
    city: "İstanbul",
    district: "Kadıköy",
    address: "Moda Cad. No:5",
    zipCode: "34710",
    isGuestOrder: true,
    suratIdempotencyKey: "abc123",
    billingAddress: {
      fullName: "Yılmaz Ltd",
      phone: "05321234567",
      city: "İstanbul",
      address: "Bağdat Cad. 10",
    },
    shippingAddressId: "8d1f…",
    note: "kapıya bırakın, mail: x@y.co",
    ip: "10.0.0.1",
    attempts: [{ email: "a@b.com" }],
  };

  it("masks personal keys, keeps shape, location and business fields", () => {
    const out = scrubJson(guestSnapshot, "order-1:shipping_address") as Record<
      string,
      any
    >;
    expect(Object.keys(out)).toEqual(Object.keys(guestSnapshot));
    expect(out.guestName).not.toBe("Ahmet Yılmaz");
    expect(out.guestEmail).toMatch(/@uat\.invalid$/);
    expect(out.guestPhone).toMatch(/^\+90500\d{7}$/);
    expect(out.address).toMatch(/^UAT /);
    expect(out.zipCode).toBeNull();
    expect(out.ip).toBeNull();
    expect(out.city).toBe("İstanbul");
    expect(out.district).toBe("Kadıköy");
    expect(out.isGuestOrder).toBe(true);
    expect(out.suratIdempotencyKey).toBe("abc123");
    expect(out.shippingAddressId).toBe("8d1f…");
    expect(out.billingAddress.fullName).not.toBe("Yılmaz Ltd");
    expect(out.billingAddress.phone).toMatch(/^\+90500\d{7}$/);
    expect(out.billingAddress.city).toBe("İstanbul");
    expect(out.note).toMatch(/^kapıya bırakın, mail: u[0-9a-f]{12}@uat\.invalid$/);
    expect(out.attempts[0].email).toMatch(/@uat\.invalid$/);
  });

  it("is idempotent", () => {
    const once = scrubJson(guestSnapshot, "order-1:shipping_address");
    expect(scrubJson(once, "order-1:shipping_address")).toEqual(once);
  });

  it("nulls numbers under personal keys and keeps empty values", () => {
    expect(scrubJson({ phone: 5321234567, iban: "", tckn: null }, "k")).toEqual({
      phone: null,
      iban: "",
      tckn: null,
    });
  });

  it("passes scalars and arrays of non-personal data through", () => {
    expect(scrubJson(42, "k")).toBe(42);
    expect(scrubJson(null, "k")).toBeNull();
    expect(scrubJson([{ amount: 10, rate: "0.05" }], "k")).toEqual([
      { amount: 10, rate: "0.05" },
    ]);
  });
});
