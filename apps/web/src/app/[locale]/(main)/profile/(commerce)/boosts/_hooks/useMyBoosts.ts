/** @format */

"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  MY_BOOSTS_DEFAULT_LIMIT,
  type MyBoostRow,
  type MyBoostState,
  type MyBoostsResponse,
} from "@tarodan/types";
import { boostApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";

const EMPTY_META = { total: 0, page: 1, limit: 1, totalPages: 1 };

/** One section of "My boosts" (`GET /products/boost/my`). */
export function useMyBoosts(
  state: MyBoostState,
  page: number,
  enabled: boolean,
) {
  const query = useWebList<MyBoostsResponse>({
    resource: queryKeys.boost.my.resource,
    params: [state, page],
    fetcher: async () => {
      const response = await boostApi.my({
        state,
        page,
        limit: MY_BOOSTS_DEFAULT_LIMIT[state],
      });
      return response.data;
    },
    enabled,
    query: { meta: { page: "profile-boosts" } },
  });
  return {
    rows: query.data?.data ?? [],
    meta: query.data?.meta ?? EMPTY_META,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** The listing's rows as they were before the switch flipped: row id -> `autoRenew`. */
type ReminderSnapshot = Map<string, boolean>;

/** Sets `autoRenew` on the listing's cached rows, in every "My boosts" page. */
function patchRows(
  queryClient: QueryClient,
  root: readonly unknown[],
  productId: string,
  next: (row: MyBoostRow) => boolean,
) {
  queryClient.setQueriesData<MyBoostsResponse>({ queryKey: root }, (data) =>
    data
      ? {
          ...data,
          data: data.data.map((row): MyBoostRow =>
            row.productId === productId
              ? { ...row, autoRenew: next(row) }
              : row,
          ),
        }
      : data,
  );
}

/**
 * The ending-soon reminder switch of one listing. The switch flips at once;
 * a rejection (for example `boostReminderPremiumOnly`) puts back only that
 * listing's rows, so a switch flipped meanwhile on another listing keeps its
 * state, then refetches; the API's message shows as the toast.
 */
export function useBoostReminder() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const root = [queryKeys.boost.my.resource];

  return useWebMutation(
    async (vars: { productId: string; enabled: boolean }) =>
      (await boostApi.reminder(vars.productId, { enabled: vars.enabled })).data,
    {
      invalidates: root,
      successMessage: t("profile.boosts.reminder.saved"),
      mutation: {
        onMutate: async ({ productId, enabled }): Promise<ReminderSnapshot> => {
          await queryClient.cancelQueries({ queryKey: root });
          const snapshot: ReminderSnapshot = new Map();
          for (const [, data] of queryClient.getQueriesData<MyBoostsResponse>({
            queryKey: root,
          })) {
            data?.data.forEach((row) => {
              if (row.productId === productId)
                snapshot.set(row.id, row.autoRenew);
            });
          }
          patchRows(queryClient, root, productId, () => enabled);
          return snapshot;
        },
        onSettled: (_data, error, { productId }, snapshot) => {
          if (!error) return;
          const before = snapshot as ReminderSnapshot | undefined;
          patchRows(
            queryClient,
            root,
            productId,
            (row) => before?.get(row.id) ?? row.autoRenew,
          );
          void queryClient.invalidateQueries({ queryKey: root });
        },
      },
    },
  );
}
