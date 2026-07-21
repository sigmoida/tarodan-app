import { Prisma } from "@prisma/client";

import type { ListQuery, SortDirection } from "./list.types";

type SortMapEntry<TOrderBy> = (direction: SortDirection) => TOrderBy;

export interface ResolveOrderByConfig<TOrderBy> {
  defaultSort: TOrderBy;
  sortMap?: Readonly<Record<string, SortMapEntry<TOrderBy>>>;
}

interface RelationInfo {
  /** Related model name. */
  target: string;
  /** true for to-many relations (`Foo[]`). */
  isList: boolean;
}

const scalarFieldsByModel = new Map<string, ReadonlySet<string>>();
const nullableScalarFieldsByModel = new Map<string, ReadonlySet<string>>();
const relationsByModel = new Map<string, ReadonlyMap<string, RelationInfo>>();

function getModel(modelName: string) {
  return Prisma.dmmf.datamodel.models.find(({ name }) => name === modelName);
}

/** Scalar + enum field names — the columns Prisma can `orderBy` directly. */
function getScalarFields(modelName: string): ReadonlySet<string> {
  const cached = scalarFieldsByModel.get(modelName);
  if (cached) return cached;

  const model = getModel(modelName);
  const fields = new Set(
    model?.fields
      .filter(({ kind }) => kind === "scalar" || kind === "enum")
      .map(({ name }) => name) ?? [],
  );

  scalarFieldsByModel.set(modelName, fields);
  return fields;
}

/** Optional scalar + enum fields — only these support Prisma's `nulls` option. */
function getNullableScalarFields(modelName: string): ReadonlySet<string> {
  const cached = nullableScalarFieldsByModel.get(modelName);
  if (cached) return cached;

  const model = getModel(modelName);
  const fields = new Set(
    model?.fields
      .filter(
        ({ kind, isRequired }) =>
          (kind === "scalar" || kind === "enum") && !isRequired,
      )
      .map(({ name }) => name) ?? [],
  );

  nullableScalarFieldsByModel.set(modelName, fields);
  return fields;
}

/** Relation field name → { target model, isList }. */
function getRelations(modelName: string): ReadonlyMap<string, RelationInfo> {
  const cached = relationsByModel.get(modelName);
  if (cached) return cached;

  const model = getModel(modelName);
  const relations = new Map<string, RelationInfo>(
    model?.fields
      .filter(({ kind }) => kind === "object")
      .map(({ name, type, isList }) => [name, { target: type, isList }]) ?? [],
  );

  relationsByModel.set(modelName, relations);
  return relations;
}

/**
 * Resolve a (possibly dotted) sort key into a nested Prisma `orderBy`, validated
 * against the DMMF so an invalid key can never reach Prisma:
 *   "createdAt"            → { createdAt: dir }
 *   "seller.displayName"   → { seller: { displayName: dir } }
 *   "order.buyer.email"    → { order: { buyer: { email: dir } } }
 * Every intermediate segment must be a to-ONE relation and the final segment a
 * scalar/enum; otherwise `null` (→ caller falls back to the default sort).
 */
function resolveFieldPath(
  modelName: string,
  path: string,
  direction: SortDirection,
): Record<string, unknown> | null {
  const dot = path.indexOf(".");
  if (dot === -1) {
    return getScalarFields(modelName).has(path) ? { [path]: direction } : null;
  }

  const head = path.slice(0, dot);
  const relation = getRelations(modelName).get(head);
  // Only to-ONE relations can be traversed for a nested scalar orderBy.
  if (!relation || relation.isList) return null;

  const inner = resolveFieldPath(
    relation.target,
    path.slice(dot + 1),
    direction,
  );
  return inner ? { [head]: inner } : null;
}

/**
 * `<relation>Count` → order by a to-many relation's aggregate count:
 *   "productsCount" → { products: { _count: dir } }
 * `null` unless the stripped name is a real to-many relation.
 */
function resolveCountKey(
  modelName: string,
  key: string,
  direction: SortDirection,
): Record<string, unknown> | null {
  if (!key.endsWith("Count")) return null;
  const relationName = key.slice(0, -"Count".length);
  const relation = getRelations(modelName).get(relationName);
  return relation?.isList ? { [relationName]: { _count: direction } } : null;
}

/**
 * Build a Prisma `orderBy` from the request's `sortBy`/`sortOrder`. Resolution
 * order (first match wins):
 *   1. an explicit `sortMap` entry (endpoint-specific aliases),
 *   2. a scalar/enum column on the model,
 *   3. a dotted relation path (validated via DMMF),
 *   4. a `<relation>Count` aggregate,
 *   5. otherwise the default sort — an unknown key NEVER throws.
 *
 * The `sortType` hint (text/number/date) makes number/date scalar sorts put
 * empty values last (`nulls: "last"`) so blanks sink regardless of direction.
 */
export function resolveOrderBy<TOrderBy>(
  modelName: Prisma.ModelName,
  query: Pick<ListQuery, "sortBy" | "sortOrder" | "sortType">,
  config: ResolveOrderByConfig<TOrderBy>,
): TOrderBy {
  if (!query.sortBy) return config.defaultSort;

  const direction = query.sortOrder ?? "desc";

  const mappedSort = config.sortMap?.[query.sortBy];
  if (mappedSort) return mappedSort(direction);

  if (getScalarFields(modelName).has(query.sortBy)) {
    // number/date → nulls last so empty cells sink under either direction.
    const nullsLast =
      getNullableScalarFields(modelName).has(query.sortBy) &&
      (query.sortType === "number" || query.sortType === "date");
    return (
      nullsLast
        ? { [query.sortBy]: { sort: direction, nulls: "last" } }
        : { [query.sortBy]: direction }
    ) as TOrderBy;
  }

  if (query.sortBy.includes(".")) {
    const nested = resolveFieldPath(modelName, query.sortBy, direction);
    if (nested) return nested as TOrderBy;
  }

  const counted = resolveCountKey(modelName, query.sortBy, direction);
  if (counted) return counted as TOrderBy;

  return config.defaultSort;
}
