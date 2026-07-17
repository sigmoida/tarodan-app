'use client';

import { useTranslations } from 'next-intl';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { getRoleTabs } from './_lib/constants';
import { PermissionMatrixTab } from './_components/PermissionMatrixTab';
import { StaffAssignmentsTab } from './_components/StaffAssignmentsTab';

export default function RolesPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam('matrix');

  return (
    <AdminPage>
      <PageHeader
        title={t('admin.roles.title')}
        description={t('admin.roles.description')}
      />
      <AdminTabs tabs={getRoleTabs(t)} value={tab} onChange={setTab} />

      {tab === 'users' ? (
        <StaffAssignmentsTab onShowMatrix={() => setTab('matrix')} />
      ) : (
        <PermissionMatrixTab />
      )}
    </AdminPage>
  );
}
