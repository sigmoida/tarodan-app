// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  patch: vi.fn(),
  post: vi.fn(),
  getUsers: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/api", () => ({
  adminApi: { patch: h.patch, post: h.post, getUsers: h.getUsers },
}));

import {
  apiError,
  bodyText,
  button,
  click,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import type { AdPackage, AdPackageTier } from "../_lib/types";
import { PackageFormModal } from "./PackageFormModal";

const tier = (over: Partial<AdPackageTier>): AdPackageTier => ({
  id: "tier",
  durationDays: 7,
  minAmount: 0,
  maxAmount: null,
  price: 150,
  campaignPrice: null,
  campaignStartsAt: null,
  campaignEndsAt: null,
  isActive: true,
  ...over,
});

const PKG: AdPackage = {
  id: "pkg-1",
  name: "Ekonomik",
  slug: "ekonomik",
  showcaseOnHome: false,
  isActive: true,
  sortOrder: 0,
  audienceMode: "everyone",
  targetTierTypes: [],
  targetUsers: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  tiers: [
    tier({ id: "t1", minAmount: 200, maxAmount: 1000 }),
    tier({ id: "t2", minAmount: 1000, maxAmount: 5000, price: 250 }),
    tier({ id: "t3", minAmount: 4000, maxAmount: null, price: 500 }),
  ],
};

/** The API's 400 for overlapping bands (rendered in the request's locale). */
const OVERLAP_MESSAGE =
  "7 günlük süre için fiyat aralıkları çakışmaktadır: 1.000 TL - 5.000 TL ile 4.000 TL - üst sınır yok.";
const refusal = (i18nKey: string, message: string, tierIndexes: unknown) => {
  const error = apiError(400, i18nKey, message);
  return {
    response: {
      ...error.response,
      data: { ...error.response.data, tierIndexes },
    },
  };
};

const onClose = vi.fn();
let view: Mounted;

const fieldError = (name: string) => {
  const input = document.body.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  if (!input) throw new Error(`no input ${name}`);
  // The shared Input renders label, input and error in one wrapper.
  return input.parentElement?.textContent ?? "";
};

beforeEach(() => {
  h.patch.mockReset().mockResolvedValue({ data: { id: "pkg-1" } });
  h.post.mockReset();
  h.getUsers.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onClose.mockReset();
  view = mount(<PackageFormModal open onClose={onClose} pkg={PKG} />);
});

afterEach(() => view.unmount());

describe("PackageFormModal", () => {
  it("shows overlapping tier bands on both rows and stays open", async () => {
    h.patch.mockRejectedValue(
      refusal("server.admin.adPackage.tierOverlap", OVERLAP_MESSAGE, [1, 2]),
    );

    await click(button("common.update"));

    expect(h.patch).toHaveBeenCalledWith(
      "/admin/ad-packages/pkg-1",
      expect.objectContaining({
        tiers: [
          expect.objectContaining({ minAmount: 200, maxAmount: 1000 }),
          expect.objectContaining({ minAmount: 1000, maxAmount: 5000 }),
          expect.objectContaining({ minAmount: 4000, maxAmount: null }),
        ],
      }),
    );
    expect(fieldError("tiers.1.minAmount")).toContain(OVERLAP_MESSAGE);
    expect(fieldError("tiers.2.minAmount")).toContain(OVERLAP_MESSAGE);
    expect(fieldError("tiers.0.minAmount")).not.toContain(OVERLAP_MESSAGE);
    expect(bodyText().split(OVERLAP_MESSAGE)).toHaveLength(3);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an upper bound not above the lower bound on that row's upper bound", async () => {
    const message = "Fiyat üst sınırı alt sınırdan büyük olmalıdır.";
    h.patch.mockRejectedValue(
      refusal("server.admin.commission.maxAboveMin", message, [0]),
    );

    await click(button("common.update"));

    expect(fieldError("tiers.0.maxAmount")).toContain(message);
    expect(fieldError("tiers.0.minAmount")).not.toContain(message);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("marks only the rows the form has when some indexes are out of range", async () => {
    h.patch.mockRejectedValue(
      refusal("server.admin.adPackage.tierOverlap", OVERLAP_MESSAGE, [1, 3]),
    );

    await click(button("common.update"));

    expect(fieldError("tiers.1.minAmount")).toContain(OVERLAP_MESSAGE);
    expect(bodyText().split(OVERLAP_MESSAGE)).toHaveLength(2);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["without row indexes", apiError(400, "server.admin.adPackage.slugTaken")],
    [
      "with indexes the form does not have",
      refusal("server.admin.adPackage.tierOverlap", OVERLAP_MESSAGE, [7, -1]),
    ],
    [
      // The form has 3 rows: index 3 is one past the last.
      "with the index one past the last row",
      refusal("server.admin.adPackage.tierOverlap", OVERLAP_MESSAGE, [3]),
    ],
  ])("toasts any other refusal %s", async (_label, error) => {
    h.patch.mockRejectedValue(error);

    await click(button("common.update"));

    expect(h.toast.error).toHaveBeenCalledWith(error.response.data.message);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves and closes when the API accepts the tiers", async () => {
    await click(button("common.update"));

    expect(h.toast.success).toHaveBeenCalledWith(
      "admin.marketing.adPackages.updated",
    );
    expect(onClose).toHaveBeenCalled();
  });
});
