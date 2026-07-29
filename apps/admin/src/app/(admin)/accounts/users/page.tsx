/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { ResourceList } from "@/components/list";
import { useTabParam } from "@/hooks/useTabParam";
import {
  type User,
  mapUsers,
  getUserTabs,
  getUserFilterOptions,
  getMembershipTierFilterOptions,
  getMembershipLifecycleOptions,
  userFilterParams,
  membershipTierParams,
  membershipLifecycleParams,
} from "./_lib/types";
import { UsersSummary } from "./_components/UsersSummary";
import { UsersTable } from "./_components/UsersTable";

export default function UsersPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("list");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.users.title")}
        description={<UsersSummary />}
      />
      <AdminTabs tabs={getUserTabs(t)} value={tab} onChange={setTab} />

      {tab === "ai" ? (
        <ModerationEventsPanel entityType="user" chrome={false} />
      ) : (
        <ResourceList<User>
          resource="users"
          fetcher={(params) => {
            const { filter, membershipTier, lifecycle, ...rest } = params;
            return adminApi
              .getUsers({
                ...rest,
                ...userFilterParams(filter),
                ...membershipTierParams(membershipTier),
                ...membershipLifecycleParams(lifecycle),
              })
              .then((res) => {
                const root = res.data ?? {};
                const raw = root.data ?? root.users ?? root.items ?? [];
                const total = root.meta?.total ?? root.total ?? raw.length;
                return {
                  ...res,
                  data: { data: mapUsers(raw), meta: { total } },
                };
              });
          }}
          getRowId={(u) => u.id}
          syncUrl
          initialFilters={{
            filter: "all",
            membershipTier: "all",
            lifecycle: "all",
            startDate: "",
            endDate: "",
          }}
        >
          <ResourceList.Toolbar>
            <ResourceList.Search />
            <ResourceList.FilterSelect
              name="filter"
              options={getUserFilterOptions(t)}
              className="min-w-0 overflow-hidden whitespace-nowrap sm:w-48 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
            />
            <ResourceList.FilterSelect
              name="membershipTier"
              options={getMembershipTierFilterOptions(t)}
              className="min-w-0 overflow-hidden whitespace-nowrap sm:w-44 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
            />
            <ResourceList.FilterSelect
              name="lifecycle"
              options={getMembershipLifecycleOptions(t)}
              className="min-w-0 overflow-hidden whitespace-nowrap sm:w-52 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
            />
            <ResourceList.DateRange />
          </ResourceList.Toolbar>
          <UsersTable />
          <ResourceList.Pagination />
        </ResourceList>
      )}
    </AdminPage>
  );
}
