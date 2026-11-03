import { BadRequestException } from "@nestjs/common";
import {
  catalogReferenceLookups,
  catalogReferenceUpdateData,
  catalogReferenceViolation,
  invalidCatalogReferenceError,
  loadCatalogReferenceRows,
  resolveCatalogReferenceChange,
  type CatalogReferenceIds,
  type CatalogReferenceInput,
  type CatalogReferenceRows,
} from "./catalog-reference-rule";

/**
 * The catalog reference rule shared by listing create and update: only a
 * reference that changes is validated, so a listing keeps references the
 * catalog has since deactivated or moved.
 */
describe("catalog reference rule", () => {
  const STORED: CatalogReferenceIds = {
    brandId: "brand-a",
    carModelId: "model-a1",
    manufacturerId: "maker-1",
  };
  const ACTIVE_ROWS: CatalogReferenceRows = {
    brand: { isActive: true },
    carModel: { isActive: true, brandId: "brand-a" },
    manufacturer: { isActive: true },
  };

  const violationOf = (
    current: CatalogReferenceIds | null,
    input: CatalogReferenceInput,
    rows: Partial<CatalogReferenceRows> = {},
  ) =>
    catalogReferenceViolation(resolveCatalogReferenceChange(current, input), {
      ...ACTIVE_ROWS,
      ...rows,
    });

  describe("resolveCatalogReferenceChange", () => {
    it("keeps every stored value when the body omits all three", () => {
      expect(resolveCatalogReferenceChange(STORED, {})).toEqual({
        next: STORED,
        changed: { brand: false, carModel: false, manufacturer: false },
      });
    });

    it("treats the same ids as unchanged", () => {
      expect(resolveCatalogReferenceChange(STORED, STORED).changed).toEqual({
        brand: false,
        carModel: false,
        manufacturer: false,
      });
    });

    it.each([null, "", "  "])("clears a reference sent as %p", (value) => {
      const change = resolveCatalogReferenceChange(STORED, {
        brandId: value,
        carModelId: value,
        manufacturerId: value,
      });

      expect(change.next).toEqual({
        brandId: null,
        carModelId: null,
        manufacturerId: null,
      });
      expect(change.changed).toEqual({
        brand: true,
        carModel: true,
        manufacturer: true,
      });
    });

    it("clears the model when the brand changes and carModelId is omitted (mobile 1.0.5-1.1.1)", () => {
      const change = resolveCatalogReferenceChange(STORED, {
        brandId: "brand-b",
        manufacturerId: "maker-1",
      });

      expect(change.next.carModelId).toBeNull();
      expect(change.changed).toEqual({
        brand: true,
        carModel: true,
        manufacturer: false,
      });
    });

    it("clears an omitted model on a brand change even when it belongs to the new brand", () => {
      // The rule does not look at the row: a client that wants to keep the
      // model across a brand change sends it.
      const change = resolveCatalogReferenceChange(STORED, {
        brandId: "brand-b",
      });

      expect(change.next.carModelId).toBeNull();
      expect(catalogReferenceUpdateData(change).carModel).toEqual({
        disconnect: true,
      });
    });

    it("keeps an explicit model sent with a brand change", () => {
      const change = resolveCatalogReferenceChange(STORED, {
        brandId: "brand-b",
        carModelId: "model-b1",
      });

      expect(change.next.carModelId).toBe("model-b1");
    });

    it("keeps the model when the brand is sent unchanged and carModelId is omitted", () => {
      const change = resolveCatalogReferenceChange(STORED, {
        brandId: "brand-a",
      });

      expect(change.next.carModelId).toBe("model-a1");
      expect(change.changed.carModel).toBe(false);
    });

    it("counts a model already empty as unchanged after a brand change", () => {
      const change = resolveCatalogReferenceChange(
        { ...STORED, carModelId: null },
        { brandId: "brand-b" },
      );

      expect(change.changed.carModel).toBe(false);
    });

    it("counts every reference of a new listing as changed", () => {
      const change = resolveCatalogReferenceChange(null, {
        brandId: "brand-a",
        manufacturerId: "maker-1",
      });

      expect(change).toEqual({
        next: {
          brandId: "brand-a",
          carModelId: null,
          manufacturerId: "maker-1",
        },
        changed: { brand: true, carModel: true, manufacturer: true },
      });
    });

    it("trims a sent id", () => {
      expect(
        resolveCatalogReferenceChange(STORED, { brandId: " brand-a " }).changed
          .brand,
      ).toBe(false);
    });
  });

  describe("catalogReferenceViolation on an edit", () => {
    const INACTIVE_ROWS: CatalogReferenceRows = {
      brand: { isActive: false },
      carModel: { isActive: false, brandId: "brand-other" },
      manufacturer: { isActive: false },
    };

    it("accepts unchanged references even when all three are inactive and the model moved brand", () => {
      // Rows are not even consulted for unchanged references.
      expect(violationOf(STORED, STORED, INACTIVE_ROWS)).toBeNull();
      expect(violationOf(STORED, {}, INACTIVE_ROWS)).toBeNull();
    });

    it("accepts the shared web/admin payload: same refs and carModelId null on a listing without a model", () => {
      expect(
        violationOf(
          { ...STORED, carModelId: null },
          { brandId: "brand-a", carModelId: null, manufacturerId: "maker-1" },
          INACTIVE_ROWS,
        ),
      ).toBeNull();
    });

    it("grandfathers an unchanged empty brand and manufacturer", () => {
      const legacy = { brandId: null, carModelId: null, manufacturerId: null };

      expect(violationOf(legacy, {})).toBeNull();
      expect(
        violationOf(legacy, { brandId: null, manufacturerId: null }),
      ).toBeNull();
    });

    it("refuses clearing a brand or a manufacturer", () => {
      expect(violationOf(STORED, { brandId: null })).toBe("brandRequired");
      expect(violationOf(STORED, { brandId: "" })).toBe("brandRequired");
      expect(violationOf(STORED, { manufacturerId: null })).toBe(
        "manufacturerRequired",
      );
    });

    it("accepts clearing the model", () => {
      expect(violationOf(STORED, { carModelId: null })).toBeNull();
    });

    it.each([
      ["unknown", { brand: null }, "brandNotFound"],
      ["inactive", { brand: { isActive: false } }, "brandInactive"],
    ] as const)(
      "refuses a brand change to an %s brand",
      (_label, rows, violation) => {
        expect(violationOf(STORED, { brandId: "brand-b" }, rows)).toBe(
          violation,
        );
      },
    );

    it.each([
      ["unknown", { manufacturer: null }, "manufacturerNotFound"],
      [
        "inactive",
        { manufacturer: { isActive: false } },
        "manufacturerInactive",
      ],
    ] as const)(
      "refuses a manufacturer change to an %s manufacturer",
      (_label, rows, violation) => {
        expect(violationOf(STORED, { manufacturerId: "maker-2" }, rows)).toBe(
          violation,
        );
      },
    );

    it("accepts a brand change to an active brand with the model omitted (model cleared)", () => {
      expect(
        violationOf(
          STORED,
          { brandId: "brand-b", manufacturerId: "maker-1" },
          { carModel: null },
        ),
      ).toBeNull();
    });

    it("refuses a brand change that keeps the old brand's model", () => {
      expect(
        violationOf(STORED, { brandId: "brand-b", carModelId: "model-a1" }),
      ).toBe("carModelBrandMismatch");
    });

    it("accepts a brand change with an active model of the new brand", () => {
      expect(
        violationOf(
          STORED,
          { brandId: "brand-b", carModelId: "model-b1" },
          { carModel: { isActive: true, brandId: "brand-b" } },
        ),
      ).toBeNull();
    });

    it("accepts a brand change that keeps an inactive model now under the new brand", () => {
      // The model itself did not change, so only its brand is checked.
      expect(
        violationOf(
          STORED,
          { brandId: "brand-b", carModelId: "model-a1" },
          { carModel: { isActive: false, brandId: "brand-b" } },
        ),
      ).toBeNull();
    });

    it.each([
      ["unknown", null, "carModelNotFound"],
      ["inactive", { isActive: false, brandId: "brand-a" }, "carModelInactive"],
      [
        "other brand's",
        { isActive: true, brandId: "brand-b" },
        "carModelBrandMismatch",
      ],
    ] as const)(
      "refuses a model change to an %s model under the same brand",
      (_label, carModel, violation) => {
        expect(
          violationOf(STORED, { carModelId: "model-a2" }, { carModel }),
        ).toBe(violation);
      },
    );

    it("refuses setting a model on a listing without a brand", () => {
      expect(
        violationOf(
          { brandId: null, carModelId: null, manufacturerId: "maker-1" },
          { carModelId: "model-a1" },
        ),
      ).toBe("carModelBrandMismatch");
    });
  });

  describe("catalogReferenceViolation on a new listing", () => {
    const VALID = {
      brandId: "brand-a",
      carModelId: "model-a1",
      manufacturerId: "maker-1",
    };

    it("accepts active references with or without a model", () => {
      expect(violationOf(null, VALID)).toBeNull();
      expect(violationOf(null, { ...VALID, carModelId: undefined })).toBeNull();
    });

    it("requires a brand and a manufacturer", () => {
      expect(violationOf(null, { ...VALID, brandId: undefined })).toBe(
        "brandRequired",
      );
      expect(violationOf(null, { ...VALID, manufacturerId: "" })).toBe(
        "manufacturerRequired",
      );
    });

    it.each([
      [{ brand: { isActive: false } }, "brandInactive"],
      [{ manufacturer: { isActive: false } }, "manufacturerInactive"],
      [
        { carModel: { isActive: false, brandId: "brand-a" } },
        "carModelInactive",
      ],
      [
        { carModel: { isActive: true, brandId: "brand-b" } },
        "carModelBrandMismatch",
      ],
    ] as const)("refuses %j", (rows, violation) => {
      expect(violationOf(null, VALID, rows)).toBe(violation);
    });
  });

  describe("catalogReferenceLookups", () => {
    it("loads nothing for an unchanged save", () => {
      expect(
        catalogReferenceLookups(resolveCatalogReferenceChange(STORED, STORED)),
      ).toEqual({ brandId: null, carModelId: null, manufacturerId: null });
    });

    it("loads the kept model after a brand change, but not a cleared one", () => {
      expect(
        catalogReferenceLookups(
          resolveCatalogReferenceChange(STORED, {
            brandId: "brand-b",
            carModelId: "model-a1",
          }),
        ),
      ).toEqual({
        brandId: "brand-b",
        carModelId: "model-a1",
        manufacturerId: null,
      });
      expect(
        catalogReferenceLookups(
          resolveCatalogReferenceChange(STORED, { brandId: "brand-b" }),
        ).carModelId,
      ).toBeNull();
    });

    it("loads all three for a new listing", () => {
      expect(
        catalogReferenceLookups(resolveCatalogReferenceChange(null, STORED)),
      ).toEqual(STORED);
    });
  });

  describe("catalogReferenceUpdateData", () => {
    it("writes nothing for unchanged references", () => {
      expect(
        catalogReferenceUpdateData(
          resolveCatalogReferenceChange(STORED, STORED),
        ),
      ).toEqual({});
    });

    it("connects changed ids and disconnects a cleared model", () => {
      expect(
        catalogReferenceUpdateData(
          resolveCatalogReferenceChange(STORED, {
            brandId: "brand-b",
            manufacturerId: "maker-2",
          }),
        ),
      ).toEqual({
        brand: { connect: { id: "brand-b" } },
        carModel: { disconnect: true },
        manufacturer: { connect: { id: "maker-2" } },
      });
    });
  });

  describe("loadCatalogReferenceRows", () => {
    const db = () => ({
      brand: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      carModel: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isActive: true, brandId: "brand-a" }),
      },
      manufacturer: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
    });

    it("reads only the requested rows", async () => {
      const prisma = db();

      const rows = await loadCatalogReferenceRows(prisma as never, {
        brandId: null,
        carModelId: "model-a1",
        manufacturerId: null,
      });

      expect(prisma.brand.findUnique).not.toHaveBeenCalled();
      expect(prisma.manufacturer.findUnique).not.toHaveBeenCalled();
      expect(prisma.carModel.findUnique).toHaveBeenCalledWith({
        where: { id: "model-a1" },
        select: { isActive: true, brandId: true },
      });
      expect(rows).toEqual({
        brand: null,
        carModel: { isActive: true, brandId: "brand-a" },
        manufacturer: null,
      });
    });
  });

  it("refuses with the existing catalog key", () => {
    const error = invalidCatalogReferenceError();

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      i18nKey: "server.product.invalidBrandModelManufacturer",
    });
  });
});
