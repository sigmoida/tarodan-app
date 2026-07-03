'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { STATUS_TABS } from './_lib/types';
import { ApplicationsList } from './_components/ApplicationsList';

export default function SellerApplicationsPage() {
  const [tab, setTab] = useTabParam('pending');

  return (
    <AdminPage>
      <PageHeader
        title="Kurumsal Satıcı Başvuruları"
        description="Kurumsal hesap açma taleplerini inceleyin ve onaylayın"
      />
      <AdminTabs tabs={STATUS_TABS} value={tab} onChange={setTab} />

      {/* key={tab} → remount so `status` seeds initialFilters (read once at mount). */}
      <ApplicationsList key={tab} status={tab} />
    </AdminPage>
  );
}
