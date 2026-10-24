import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  emptyTierRow,
  nextTierRow,
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

  it.each([
    ["1000", "999"],
    ["1000", "1000"],
    ["1000", "1000,00"],
  ])(
    "refuses a band from %s whose exclusive upper bound is %s",
    (minAmount, maxAmount) => {
      expect(tierMessages(form({ minAmount, maxAmount }), "maxAmount")).toEqual(
        ["admin.finance.commission.validation.strictRange"],
      );
    },
  );

  it.each([
    ["1000", "1000,01"],
    ["1000", "5000"],
    ["5000", ""],
    ["0", "999"],
  ])("accepts a band from %s up to %s", (minAmount, maxAmount) => {
    expect(tierMessages(form({ minAmount, maxAmount }), "maxAmount")).toEqual(
      [],
    );
  });

  it("compares a blank lower bound as 0 and skips a refused one", () => {
    expect(
      tierMessages(form({ minAmount: "", maxAmount: "0" }), "maxAmount"),
    ).toEqual(["admin.finance.commission.validation.strictRange"]);
    expect(
      tierMessages(form({ minAmount: "1.000", maxAmount: "0" }), "maxAmount"),
    ).toEqual([]);
  });

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

describe("nextTierRow", () => {
  const row = (over: Partial<PackageFormValues["tiers"][number]>) => ({
    ...emptyTierRow,
    price: "49,90",
    ...over,
  });

  it("starts the first row at 0 with no upper bound", () => {
    expect(nextTierRow([])).toEqual(emptyTierRow);
  });

  it.each([
    ["999", "999"],
    ["1000", "1000"],
    ["5000", "5000"],
    ["2500,50", "2500,50"],
    ["1000,00", "1000"],
  ])(
    "starts the next band of the duration at the previous upper bound %s",
    (maxAmount, minAmount) => {
      const next = nextTierRow([
        row({ durationDays: "30", minAmount: "0", maxAmount }),
      ]);
      expect(next).toEqual({
        ...emptyTierRow,
        durationDays: "30",
        minAmount,
        maxAmount: "",
        price: "",
      });
    },
  );

  it("starts a new duration at 0 after an open-ended band", () => {
    // Copying the duration would give a second band covering every price.
    expect(
      nextTierRow([row({ durationDays: "30", minAmount: "5000" })]),
    ).toEqual({ ...emptyTierRow, durationDays: "" });
  });

  it("starts a new duration when the previous upper bound is not an amount", () => {
    expect(nextTierRow([row({ maxAmount: "1.000" })])).toEqual({
      ...emptyTierRow,
      durationDays: "",
    });
  });

  it("gives contiguous bands with no gap when the form is filled in order", () => {
    // The admin types each upper bound and adds the next row, as on screen.
    const rows = [{ ...emptyTierRow, maxAmount: "1000", price: "10" }];
    for (const [maxAmount, price] of [
      ["5000", "20"],
      ["", "30"],
    ]) {
      rows.push({ ...nextTierRow(rows), maxAmount, price });
    }
    const values = { ...form({}), tiers: rows };
    expect(schema.safeParse(values).success).toBe(true);

    const bands = packageFormToPayload(values).tiers;
    expect(
      bands.map((b) => [b.durationDays, b.minAmount, b.maxAmount]),
    ).toEqual([
      [7, 0, 1000],
      [7, 1000, 5000],
      [7, 5000, null],
    ]);
    // The API rule: min <= price < max, a null max has no upper bound.
    const covering = (price: number) =>
      bands.filter(
        (b) =>
          b.minAmount <= price && (b.maxAmount == null || price < b.maxAmount),
      ).length;
    for (const price of [0, 998.99, 999, 999.99, 1000, 4999.99, 5000, 1e6]) {
      expect(covering(price)).toBe(1);
    }
  });
});
