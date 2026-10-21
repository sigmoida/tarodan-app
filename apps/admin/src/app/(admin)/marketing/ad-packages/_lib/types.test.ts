import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  emptyTierRow,
  packageFormToPayload,
  packageSchema,
  packageToForm,
  type AdPackage,
  type PackageFormValues,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;
const schema = packageSchema(t);

const form = (tier: Partial<PackageFormValues["tiers"][number]>) =>
  ({
    ...packageToForm(),
    name: "Vitrin",
    slug: "vitrin",
    tiers: [{ ...emptyTierRow, price: "49,90", ...tier }],
  }) satisfies PackageFormValues;

const tierMessages = (values: PackageFormValues, field: string) => {
  const result = schema.safeParse(values);
  return result.success
    ? []
    : result.error.issues
        .filter((issue) => issue.path.join(".") === `tiers.0.${field}`)
        .map((issue) => issue.message);
};

describe("packageSchema tier amounts", () => {
  it.each(["minAmount", "maxAmount", "price", "campaignPrice"] as const)(
    'refuses a grouped %s ("1.000" is not 1 TL)',
    (field) => {
      expect(tierMessages(form({ [field]: "1.000" }), field)).toEqual([
        "validation.amountFormatRefused",
      ]);
    },
  );

  it("requires a price but accepts 0", () => {
    expect(tierMessages(form({ price: "" }), "price")).toEqual([
      "admin.marketing.adPackages.validation.priceMin",
    ]);
    expect(tierMessages(form({ price: "0" }), "price")).toEqual([]);
  });
});

describe("packageFormToPayload tier amounts", () => {
  it("reads comma and whole amounts as TL", () => {
    const [tier] = packageFormToPayload(
      form({
        minAmount: "1000",
        maxAmount: "2500,50",
        price: "49,90",
        campaignPrice: "",
      }),
    ).tiers;
    expect(tier).toMatchObject({
      minAmount: 1000,
      maxAmount: 2500.5,
      price: 49.9,
      campaignPrice: null,
    });
  });

  it("round-trips the edit prefill with a decimal comma", () => {
    const pkg = {
      id: "p1",
      name: "Vitrin",
      slug: "vitrin",
      showcaseOnHome: false,
      isActive: true,
      sortOrder: 0,
      audienceMode: "everyone",
      targetTierTypes: [],
      targetUsers: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      tiers: [
        {
          id: "t1",
          durationDays: 7,
          minAmount: 0,
          maxAmount: 1000,
          price: 49.9,
          campaignPrice: 39.9,
          campaignStartsAt: null,
          campaignEndsAt: null,
          isActive: true,
        },
      ],
    } satisfies AdPackage;
    const values = packageToForm(pkg);
    expect(values.tiers[0]).toMatchObject({
      minAmount: "0",
      maxAmount: "1000",
      price: "49,90",
      campaignPrice: "39,90",
    });
    expect(packageFormToPayload(values).tiers[0]).toMatchObject({
      minAmount: 0,
      maxAmount: 1000,
      price: 49.9,
      campaignPrice: 39.9,
    });
  });
});
