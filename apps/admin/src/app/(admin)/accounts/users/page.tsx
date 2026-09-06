/** @format */

"use client";

import { useTranslations } from "next-intl";
import { ACCOUNT_STATUSES, type AccountStatus } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { ResourceList } from "@/components/list";
import { useListTotals } from "@/hooks/useListTotal";
import { useTabParam } from "@/hooks/useTabParam";
import {
  type User,
  AI_TAB,
  mapUsers,
  getUserTabs,
  isAccountStatus,
  membershipTierParams,
  membershipLifecycleParams,
  loginStateParams,
} from "./_lib/types";
import { userFilterFields } from "./_lib/filters";
import { UsersSummary } from "./_components/UsersSummary";
import { UsersTable } from "./_components/UsersTable";
import { UsersBulkBar } from "./_components/UsersBulkBar";

const DEFAULT_TAB: AccountStatus = "active";

/** Sekme sayaçlarının parametreleri: durum başına `{ accountStatus }`. */
const TAB_COUNT_PARAMS = Object.fromEntries(
  ACCOUNT_STATUSES.map((status) => [status, { accountStatus: status }]),
) as Record<AccountStatus, { accountStatus: AccountStatus }>;

/**
 * Kullanıcılar: hesap durumu (aktif / aktivasyon bekliyor / engelli / silinmiş)
 * sekmedir, kolon ya da filtre değil. Sekme `accountStatus`'un tek sahibidir:
 * fetcher'da her isteğe eklenir, URL'den okunmaz/yazılmaz. AI Denetim son
 * sekmede kalır.
 */
export default function UsersPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam(DEFAULT_TAB);
  const status: AccountStatus = isAccountStatus(tab) ? tab : DEFAULT_TAB;
  const counts = useListTotals("users", TAB_COUNT_PARAMS, adminApi.getUsers);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.users.title")}
        description={<UsersSummary />}
      />
      <AdminTabs tabs={getUserTabs(t, counts)} value={tab} onChange={setTab} />

      {tab === AI_TAB ? (
        <ModerationEventsPanel entityType="user" chrome={false} />
      ) : (
        <ResourceList<User>
          key={status}
          resource="users"
          fetcher={(params) => {
            const { membershipTier, lifecycle, loginState, ...rest } = params;
            return adminApi
              .getUsers({
                ...rest,
                // Sekmenin sabit durumu: URL filtresi değil, her isteğe eklenir.
                accountStatus: status,
                ...membershipTierParams(membershipTier),
                ...membershipLifecycleParams(lifecycle),
                ...loginStateParams(loginState),
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
          selectable
          filters={userFilterFields(t)}
        >
          <ResourceList.Toolbar />
          <UsersBulkBar />
          <UsersTable />
          <ResourceList.Pagination />
        </ResourceList>
      )}
    </AdminPage>
  );
}
