/** @format */

"use client";

import { useQueryClient } from "@tanstack/react-query";
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

type Snapshot = [readonly unknown[], MyBoostsResponse | undefined][];

/**
 * The ending-soon reminder switch of one listing. The switch flips at once;
 * a rejection (for example `boostReminderPremiumOnly`) restores the cached
 * rows and the API's message shows as the toast.
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
        onMutate: async ({ productId, enabled }): Promise<Snapshot> => {
          await queryClient.cancelQueries({ queryKey: root });
          const snapshot = queryClient.getQueriesData<MyBoostsResponse>({
            queryKey: root,
          }) as Snapshot;
          queryClient.setQueriesData<MyBoostsResponse>(
            { queryKey: root },
            (data) =>
              data && {
                ...data,
                data: data.data.map((row: MyBoostRow): MyBoostRow =>
                  row.productId === productId
                    ? { ...row, autoRenew: enabled }
                    : row,
                ),
              },
          );
          return snapshot;
        },
        onSettled: (_data, error, _vars, snapshot) => {
          if (!error) return;
          (snapshot as Snapshot | undefined)?.forEach(([key, data]) =>
            queryClient.setQueryData(key, data),
          );
        },
      },
    },
  );
}
