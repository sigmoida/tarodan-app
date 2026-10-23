import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  tariffFormToPayload,
  tariffSchema,
  tariffToForm,
  type ShippingTariff,
  type TariffFormValues,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;
const schema = tariffSchema(t);

const tariff = {
  id: "tf1",
  provider: "surat",
  name: "Standart",
  status: "draft",
  version: 1,
  currency: "TRY",
  freeShippingEnabled: true,
  // Decimal columns arrive as strings.
  freeShippingThreshold: "1500.50",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  packageTiers: [
    {
      id: "s",
      code: "small",
      label: "Small",
      minDesi: 0,
      maxDesi: 2,
      amount: "89.90",
      sampleWidth: null,
      sampleHeight: null,
      sampleLength: null,
      sortOrder: 0,
    },
    {
      id: "m",
      code: "medium",
      label: "Medium",
      minDesi: 2,
      maxDesi: 5,
      amount: 120,
      sampleWidth: null,
      sampleHeight: null,
      sampleLength: null,
      sortOrder: 1,
    },
    {
      id: "l",
      code: "large",
      label: "Large",
      minDesi: 5,
      maxDesi: null,
      amount: 0,
      sampleWidth: null,
      sampleHeight: null,
      sampleLength: null,
      sortOrder: 2,
    },
  ],
} satisfies ShippingTariff;

const messagesAt = (values: TariffFormValues, path: string) => {
  const result = schema.safeParse(values);
  return result.success
    ? []
    : result.error.issues
        .filter((issue) => issue.path.join(".") === path)
        .map((issue) => issue.message);
};

describe("shipping tariff amounts", () => {
  it("prefills with a decimal comma, 0 kept as 0", () => {
    const form = tariffToForm(t, tariff);
    expect(form.freeShippingThreshold).toBe("1500,50");
    expect(form.packageTiers.map((tier) => tier.amount)).toEqual([
      "89,90",
      "120",
      "0",
    ]);
    expect(schema.safeParse(form).success).toBe(true);
  });

  it("round-trips the prefill unchanged", () => {
    const payload = tariffFormToPayload(tariffToForm(t, tariff));
    expect(payload.freeShippingThreshold).toBe(1500.5);
    expect(payload.packageTiers.map((tier) => tier.amount)).toEqual([
      89.9, 120, 0,
    ]);
  });

  it('refuses "1.000" instead of reading it as 1 TL', () => {
    const form = tariffToForm(t, tariff);
    expect(
      messagesAt(
        { ...form, freeShippingThreshold: "1.000" },
        "freeShippingThreshold",
      ),
    ).toEqual(["validation.amountFormatRefused"]);
    const tiers = form.packageTiers.map((tier, index) =>
      index === 1 ? { ...tier, amount: "1.250,50" } : tier,
    );
    expect(
      messagesAt({ ...form, packageTiers: tiers }, "packageTiers.1.amount"),
    ).toEqual(["validation.amountFormatRefused"]);
  });

  it("requires a tier amount and sends typed amounts as TL", () => {
    const form = tariffToForm(t, tariff);
    const blank = form.packageTiers.map((tier, index) =>
      index === 0 ? { ...tier, amount: "" } : tier,
    );
    expect(
      messagesAt({ ...form, packageTiers: blank }, "packageTiers.0.amount"),
    ).toEqual(["admin.shippingTariffs.invalidAmount"]);

    const typed = form.packageTiers.map((tier, index) =>
      index === 0 ? { ...tier, amount: "1000" } : tier,
    );
    const payload = tariffFormToPayload({
      ...form,
      freeShippingThreshold: "2000,5",
      packageTiers: typed,
    });
    expect(payload.freeShippingThreshold).toBe(2000.5);
    expect(payload.packageTiers[0].amount).toBe(1000);
  });
});
