import { getMetadataStorage } from "class-validator";
import { SAVED_SEARCH_QUERY_KEYS } from "@tarodan/types";
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
