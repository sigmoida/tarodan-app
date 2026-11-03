// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  push: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("@/lib/api", () => ({
  adminApi: { getProduct: h.getProduct, updateProduct: h.updateProduct },
}));

/**
 * The cards, mappers and option hooks belong to the shared listing form and
 * are tested there; this screen only wires them. Stub them so the test pins
 * the wiring: the submit guard.
 */
vi.mock("@tarodan/listing-form", async () => {
  const { z } = await import("zod");
  const Card = () => null;
  return {
    DiscountCard: Card,
    GlobalAttributesCard: Card,
    ImagesCard: Card,
    ManufacturerAttributesCard: Card,
    OptionsCard: Card,
    PricingCard: Card,
    ProductDetailsCard: Card,
    TitleDescriptionCard: Card,
    buildListingFormData: () => ({ newFormData: {} }),
    toEditListingValues: () => ({ price: "" }),
    buildListingUpdatePayload: () => ({ title: "x" }),
    buildSaleDataFromListing: () => ({ saleData: {}, saleActive: false }),
    createEmptySaleData: () => ({}),
    buildEditListingSchema: () => z.object({}),
    emptyEditValues: { price: "" },
    getConditions: () => [],
    getYearOptions: () => [],
    NO_PRICE_LIMITS: {},
    priceLimitMessages: () => ({}),
    saleDataError: () => null,
    useCarModels: () => ({ models: [], modelsLoading: false }),
    useListingCategories: () => ({ flatCategories: [] }),
    useListingFilters: () => ({
      scales: [],
      materials: [],
      colors: [],
      brands: [],
      manufacturers: [],
      brandsLoading: false,
      optionsStatus: "success",
    }),
    useListingImageUpload: () => ({
      items: [],
      uploadingImages: false,
      submitBlocker: null,
      seedExistingImages: () => {},
      handleFileUpload: () => {},
      removeImage: () => {},
      retryImage: () => {},
      rotateImage: () => {},
      moveImage: () => {},
      makeCover: () => {},
    }),
    useAttributeGroups: () => ({
      globalAttrGroups: [],
      manufacturerAttrGroups: [],
      requiredGroupSlugs: [],
      attrGroupsStatus: "success",
    }),
    withSelectedReference: (list: unknown[]) => list,
  };
});

import { apiError, button, flush, mount } from "@/test-utils/dom";
import ProductEditClient from "./ProductEditClient";

describe("ProductEditClient submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getProduct.mockResolvedValue({ data: { edit: { images: [] } } });
    h.updateProduct.mockRejectedValue(apiError(400));
  });

  it("sends one PATCH for a double submit, and allows a retry after it settles", async () => {
    const view = mount(<ProductEditClient id="p1" />);
    await flush();

    // Two submits before the pending state re-renders the button disabled
    // (RHF validation is async, so both reach onSubmit).
    await act(async () => {
      button("common.save").click();
      button("common.save").click();
    });
    await flush();
    expect(h.updateProduct).toHaveBeenCalledTimes(1);

    // The failed request released the guard: the next save goes out.
    await act(async () => {
      button("common.save").click();
    });
    await flush();
    expect(h.updateProduct).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
