import { Prisma } from "@prisma/client";

import type { ListQuery, SortDirection } from "./list.types";

type SortMapEntry<TOrderBy> = (direction: SortDirection) => TOrderBy;

export interface ResolveOrderByConfig<TOrderBy> {
  defaultSort: TOrderBy;
  sortMap?: Readonly<Record<string, SortMapEntry<TOrderBy>>>;
}

const sortableFieldsByModel = new Map<Prisma.ModelName, ReadonlySet<string>>();

function getSortableFields(modelName: Prisma.ModelName): ReadonlySet<string> {
  const cachedFields = sortableFieldsByModel.get(modelName);
  if (cachedFields) return cachedFields;

  const model = Prisma.dmmf.datamodel.models.find(
    ({ name }) => name === modelName,
  );
  const sortableFields = new Set(
    model?.fields
      .filter(({ kind }) => kind === "scalar" || kind === "enum")
      .map(({ name }) => name) ?? [],
  );

  sortableFieldsByModel.set(modelName, sortableFields);
  return sortableFields;
}

export function resolveOrderBy<TOrderBy>(
  modelName: Prisma.ModelName,
  query: Pick<ListQuery, "sortBy" | "sortOrder">,
  config: ResolveOrderByConfig<TOrderBy>,
): TOrderBy {
  if (!query.sortBy) return config.defaultSort;

  const direction = query.sortOrder ?? "desc";

  const mappedSort = config.sortMap?.[query.sortBy];
  if (mappedSort) return mappedSort(direction);

  if (getSortableFields(modelName).has(query.sortBy)) {
    return { [query.sortBy]: direction } as TOrderBy;
  }

  return config.defaultSort;
}
