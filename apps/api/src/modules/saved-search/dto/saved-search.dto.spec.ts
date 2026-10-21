import { getMetadataStorage } from "class-validator";
import { SAVED_SEARCH_QUERY_KEYS, type SavedSearchSort } from "@tarodan/types";
import { ProductQueryDto } from "../../product/dto/product-query.dto";
import { SavedSearchQueryDto } from "./saved-search.dto";

/**
 * "A value GET /products refuses is refused here too": every validator and
 * transform-relevant rule of ProductQueryDto on an allow-listed key must
 * still apply on SavedSearchQueryDto, also after a field is redeclared to add
 * a cap (class-validator drops same-kind inherited validators on redeclare).
 */
describe("SavedSearchQueryDto keeps the GET /products validation", () => {
  const rules = (target: new () => object) =>
    getMetadataStorage()
      .getTargetValidationMetadatas(target, "", true, false)
      .filter((m) =>
        (SAVED_SEARCH_QUERY_KEYS as readonly string[]).includes(m.propertyName),
      )
      .map(
        (m) =>
          `${m.propertyName}:${m.type}:${m.name ?? ""}:${
            (m.constraintCls as { name?: string } | undefined)?.name ?? ""
          }:${JSON.stringify(m.constraints ?? [])}`,
      );

  it("has every parent rule of the allow-listed keys", () => {
    const own = new Set(rules(SavedSearchQueryDto));
    const missing = rules(ProductQueryDto).filter((rule) => !own.has(rule));
    expect(missing).toEqual([]);
  });
});

/**
 * A filter added to GET /products later must be decided for saved searches:
 * one that is neither saved nor listed as not saved would be dropped silently
 * and a saved search would come back broader than what the user saw.
 */
describe("the saved-search allow-list covers every GET /products param", () => {
  /** Paging, the seller's own views and the deprecated flat slug list. */
  const NOT_SAVED = [
    "page",
    "limit",
    "sellerId",
    "status",
    "boostedOnly",
    "homeShowcase",
    "tradeEligible",
    "inactiveReason",
    "attributeSlugs",
  ];

  it("each param is saved or deliberately not saved", () => {
    const params = new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(ProductQueryDto, "", true, false)
        .map((m) => m.propertyName),
    );
    const saved = new Set<string>(SAVED_SEARCH_QUERY_KEYS);
    const undecided = [...params].filter(
      (p) => !saved.has(p) && !NOT_SAVED.includes(p),
    );
    expect(undecided).toEqual([]);
    expect(NOT_SAVED.filter((p) => saved.has(p))).toEqual([]);
  });

  it("keeps exactly the explicit sorts GET /products offers", () => {
    // Compile-time: ts-jest fails the suite when the two unions drift apart
    // (a new GET /products sort would otherwise be dropped from a save).
    type Same<A, B> = [A] extends [B]
      ? [B] extends [A]
        ? true
        : false
      : false;
    const same: Same<
      NonNullable<ProductQueryDto["sortBy"]>,
      SavedSearchSort
    > = true;
    expect(same).toBe(true);
  });
});
