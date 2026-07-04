'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { ROLE_TABS } from './_lib/constants';
import { PermissionMatrixTab } from './_components/PermissionMatrixTab';
import { StaffAssignmentsTab } from './_components/StaffAssignmentsTab';

export default function RolesPage() {
  const [tab, setTab] = useTabParam('matrix');

  return (
    <AdminPage>
      <PageHeader
        title="Roller ve İzinler"
        description="Her rolün hangi işlemleri yapabileceğini görüntüleyin ve düzenleyin"
      />
      <AdminTabs tabs={ROLE_TABS} value={tab} onChange={setTab} />

      {tab === 'users' ? (
        <StaffAssignmentsTab onShowMatrix={() => setTab('matrix')} />
      ) : (
        <PermissionMatrixTab />
      )}
    </AdminPage>
  );
}
