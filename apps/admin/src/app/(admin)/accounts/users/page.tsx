'use client';

import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { ResourceList } from '@/components/list';
import { useTabParam } from '@/hooks/useTabParam';
import {
  type User,
  mapUsers,
  USER_TABS,
  userFilterOptions,
  userFilterParams,
} from './_lib/types';
import { UsersSummary } from './_components/UsersSummary';
import { UsersTable } from './_components/UsersTable';

export default function UsersPage() {
  const [tab, setTab] = useTabParam('list');

  return (
    <AdminPage>
      <PageHeader title="Kullanıcılar" description={<UsersSummary />} />
      <AdminTabs tabs={USER_TABS} value={tab} onChange={setTab} />

      {tab === 'ai' ? (
        <ModerationEventsPanel entityType="user" chrome={false} />
      ) : (
        <ResourceList<User>
          resource="users"
          fetcher={(params) => {
            const { filter, ...rest } = params;
            return adminApi
              .getUsers({ ...rest, ...userFilterParams(filter) })
              .then((res) => {
                const root = res.data ?? {};
                const raw = root.data ?? root.users ?? root.items ?? [];
                const total = root.meta?.total ?? root.total ?? raw.length;
                return { ...res, data: { data: mapUsers(raw), meta: { total } } };
              });
          }}
          getRowId={(u) => u.id}
          syncUrl
          initialFilters={{ filter: 'all' }}
          errorMessage="Kullanıcılar yüklenemedi"
        >
          <ResourceList.Toolbar>
            <ResourceList.Search placeholder="E-posta veya isim ara..." />
            <ResourceList.FilterSelect
              name="filter"
              options={userFilterOptions}
              className="sm:w-48"
            />
          </ResourceList.Toolbar>
          <UsersTable />
          <ResourceList.Pagination />
        </ResourceList>
      )}
    </AdminPage>
  );
}
