import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";

/**
 * The catalog references of a listing (brand, car model, manufacturer): the one
 * rule that listing create and update share.
 *
 * Only a reference that CHANGES is validated. Every client (web, admin, every
 * mobile version) sends the record's own references back on every save, so a
 * listing whose brand, manufacturer or model was deactivated later, or whose
 * model now sits under another brand, must still save a price- or photo-only
 * edit. Moving TO an invalid reference, or clearing a required one, is refused.
 *
 * Rules (a new listing counts every reference as changed):
 * 1. `undefined` keeps the current value, `null` or `""` clears it, a string
 *    sets it.
 * 2. A brand change without `carModelId` clears the model: a model cannot
 *    outlive its brand (mobile 1.0.5-1.1.1 omit the model after a brand change).
 * 3. A changed brand must be set, exist and be active.
 * 4. A changed manufacturer must be set, exist and be active.
 * 5. A set model whose model or brand changed must exist and belong to the next
 *    brand; a changed model must also be active.
 *
 * Everything here is pure except `loadCatalogReferenceRows`, which reads only
 * the rows the rule asks for (`catalogReferenceLookups`).
 */

export interface CatalogReferenceIds {
  brandId: string | null;
  carModelId: string | null;
  manufacturerId: string | null;
}

/** The request fields, as both DTOs carry them. */
export interface CatalogReferenceInput {
  brandId?: string | null;
  carModelId?: string | null;
  manufacturerId?: string | null;
}

export interface CatalogReferenceChange {
  /** The values the listing has after the write: validation and write read these. */
  next: CatalogReferenceIds;
  changed: { brand: boolean; carModel: boolean; manufacturer: boolean };
}

export interface CatalogReferenceRows {
  brand: { isActive: boolean } | null;
  carModel: { isActive: boolean; brandId: string } | null;
  manufacturer: { isActive: boolean } | null;
}

export type CatalogReferenceViolation =
  | "brandRequired"
  | "brandNotFound"
  | "brandInactive"
  | "manufacturerRequired"
  | "manufacturerNotFound"
  | "manufacturerInactive"
  | "carModelNotFound"
  | "carModelInactive"
  | "carModelBrandMismatch";

/** `""` and whitespace clear like `null`; ids are compared trimmed. */
function requestedId(value: string | null): string | null {
  return value?.trim() || null;
}

/**
 * Resolves the next references once. `current` is the stored listing, or
 * `null` for a new listing (every reference then counts as changed).
 */
export function resolveCatalogReferenceChange(
  current: CatalogReferenceIds | null,
  input: CatalogReferenceInput,
): CatalogReferenceChange {
  const stored: CatalogReferenceIds = current ?? {
    brandId: null,
    carModelId: null,
    manufacturerId: null,
  };
  const pick = (
    requested: string | null | undefined,
    kept: string | null,
  ): string | null => (requested === undefined ? kept : requestedId(requested));

  const brandId = pick(input.brandId, stored.brandId);
  const manufacturerId = pick(input.manufacturerId, stored.manufacturerId);
  const brandChanged = current === null || brandId !== stored.brandId;
  const carModelId =
    input.carModelId === undefined && brandChanged
      ? null
      : pick(input.carModelId, stored.carModelId);

  return {
    next: { brandId, carModelId, manufacturerId },
    changed: {
      brand: brandChanged,
      carModel: current === null || carModelId !== stored.carModelId,
      manufacturer:
        current === null || manufacturerId !== stored.manufacturerId,
    },
  };
}

/** The ids `catalogReferenceViolation` needs rows for; `null` = do not load. */
export function catalogReferenceLookups(
  change: CatalogReferenceChange,
): CatalogReferenceIds {
  const { next, changed } = change;
  return {
    brandId: changed.brand ? next.brandId : null,
    carModelId:
      next.carModelId && (changed.carModel || changed.brand)
        ? next.carModelId
        : null,
    manufacturerId: changed.manufacturer ? next.manufacturerId : null,
  };
}

/** The first rule the change breaks, or `null` when it may be written. */
export function catalogReferenceViolation(
  change: CatalogReferenceChange,
  rows: CatalogReferenceRows,
): CatalogReferenceViolation | null {
  const { next, changed } = change;
  if (changed.brand) {
    if (!next.brandId) return "brandRequired";
    if (!rows.brand) return "brandNotFound";
    if (!rows.brand.isActive) return "brandInactive";
  }
  if (changed.manufacturer) {
    if (!next.manufacturerId) return "manufacturerRequired";
    if (!rows.manufacturer) return "manufacturerNotFound";
    if (!rows.manufacturer.isActive) return "manufacturerInactive";
  }
  if (next.carModelId && (changed.carModel || changed.brand)) {
    if (!rows.carModel) return "carModelNotFound";
    if (rows.carModel.brandId !== next.brandId) return "carModelBrandMismatch";
    if (changed.carModel && !rows.carModel.isActive) return "carModelInactive";
  }
  return null;
}

/** The 400 every catalog reference refusal returns (same key, same text). */
export function invalidCatalogReferenceError(): BadRequestException {
  return new BadRequestException(
    i18nMessage("server.product.invalidBrandModelManufacturer"),
  );
}

/**
 * The relation writes of an update, from the resolved values: connect on an
 * id, disconnect on `null`, nothing for an unchanged reference.
 */
export function catalogReferenceUpdateData(
  change: CatalogReferenceChange,
): Pick<Prisma.ProductUpdateInput, "brand" | "carModel" | "manufacturer"> {
  const relation = (id: string | null) =>
    id ? { connect: { id } } : { disconnect: true };
  const { next, changed } = change;
  return {
    ...(changed.brand ? { brand: relation(next.brandId) } : {}),
    ...(changed.carModel ? { carModel: relation(next.carModelId) } : {}),
    ...(changed.manufacturer
      ? { manufacturer: relation(next.manufacturerId) }
      : {}),
  };
}

/** Reads only the rows `catalogReferenceLookups` asks for, in parallel. */
export async function loadCatalogReferenceRows(
  prisma: Pick<PrismaService, "brand" | "carModel" | "manufacturer">,
  lookups: CatalogReferenceIds,
): Promise<CatalogReferenceRows> {
  const [brand, carModel, manufacturer] = await Promise.all([
    lookups.brandId
      ? prisma.brand.findUnique({
          where: { id: lookups.brandId },
          select: { isActive: true },
        })
      : null,
    lookups.carModelId
      ? prisma.carModel.findUnique({
          where: { id: lookups.carModelId },
          select: { isActive: true, brandId: true },
        })
      : null,
    lookups.manufacturerId
      ? prisma.manufacturer.findUnique({
          where: { id: lookups.manufacturerId },
          select: { isActive: true },
        })
      : null,
  ]);
  return { brand, carModel, manufacturer };
}
