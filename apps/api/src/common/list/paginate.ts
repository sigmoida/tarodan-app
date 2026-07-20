import type { Prisma } from "@prisma/client";

import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { ListQuery, PaginatedResult } from "./list.types";

export interface ListOptions {
  where?: unknown;
  include?: unknown;
  select?: unknown;
  orderBy?: unknown;
}

interface ListDelegate {
  count(args: never): PromiseLike<number>;
  findMany(args: never): PromiseLike<readonly unknown[]>;
}

type DelegateItem<
  TDelegate extends ListDelegate,
  TOptions,
> = TDelegate extends { [key: symbol]: { types: unknown } }
  ? Prisma.Result<
      TDelegate,
      TOptions & { skip: number; take: number },
      "findMany"
    > extends readonly (infer TItem)[]
    ? TItem
    : never
  : Awaited<ReturnType<TDelegate["findMany"]>> extends readonly (infer TItem)[]
    ? TItem
    : never;

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum?: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 1)
    return fallback;

  const normalizedValue = Math.floor(value);
  return maximum === undefined
    ? normalizedValue
    : Math.min(normalizedValue, maximum);
}

export async function paginate<
  TDelegate extends ListDelegate,
  const TOptions extends Omit<
    Prisma.Args<TDelegate, "findMany">,
    "skip" | "take"
  >,
>(
  delegate: TDelegate,
  options: TOptions,
  query: Pick<ListQuery, "page" | "limit">,
): Promise<PaginatedResult<DelegateItem<TDelegate, TOptions>>> {
  const page = normalizePositiveInteger(query.page, ADMIN_LIST_DEFAULT_PAGE);
  const limit = normalizePositiveInteger(
    query.limit,
    ADMIN_LIST_DEFAULT_LIMIT,
    ADMIN_LIST_MAX_LIMIT,
  );
  const findManyArgs = {
    ...options,
    skip: (page - 1) * limit,
    take: limit,
  };

  const count = delegate.count as unknown as (
    args: Pick<ListOptions, "where">,
  ) => PromiseLike<number>;
  const findMany = delegate.findMany as unknown as (
    args: ListOptions & { skip: number; take: number },
  ) => PromiseLike<DelegateItem<TDelegate, TOptions>[]>;

  const [total, data] = await Promise.all([
    count({ where: options.where }),
    findMany(findManyArgs),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
