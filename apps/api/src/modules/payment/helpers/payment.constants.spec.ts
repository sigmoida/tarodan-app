import { paymentWindowEnd } from "./payment.constants";

/**
 * Sipariş ödeme penceresi (paymentExpiresAt) Süreler ve Kurallar'dan
 * (`orderPaymentWindowHours`) okunur; checkout, teklif kabulü ve reaktivasyon
 * aynı fonksiyonu çağırır.
 */
describe("paymentWindowEnd", () => {
  const FROM = new Date("2026-10-01T10:00:00.000Z");
  const HOUR = 60 * 60 * 1000;
  const ORIGINAL = process.env.ORDER_PAYMENT_WINDOW_HOURS;

  const reader = (value?: string) => ({
    platformSetting: {
      findUnique: jest.fn(
        async ({ where }: { where: { settingKey: string } }) =>
          value !== undefined &&
          where.settingKey === "order_payment_window_hours"
            ? { settingValue: value }
            : null,
      ),
    },
  });

  beforeEach(() => {
    delete process.env.ORDER_PAYMENT_WINDOW_HOURS;
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.ORDER_PAYMENT_WINDOW_HOURS;
    else process.env.ORDER_PAYMENT_WINDOW_HOURS = ORIGINAL;
  });

  it("admin değeri ve env yokken bugünkü gibi 24 saat", async () => {
    await expect(paymentWindowEnd(reader(), FROM)).resolves.toEqual(
      new Date(FROM.getTime() + 24 * HOUR),
    );
  });

  it("env geri düşüşünü (ORDER_PAYMENT_WINDOW_HOURS) okur", async () => {
    process.env.ORDER_PAYMENT_WINDOW_HOURS = "12";
    await expect(paymentWindowEnd(reader(), FROM)).resolves.toEqual(
      new Date(FROM.getTime() + 12 * HOUR),
    );
  });

  it("admin değeri env'i ezer", async () => {
    process.env.ORDER_PAYMENT_WINDOW_HOURS = "12";
    await expect(paymentWindowEnd(reader("48"), FROM)).resolves.toEqual(
      new Date(FROM.getTime() + 48 * HOUR),
    );
  });
});
