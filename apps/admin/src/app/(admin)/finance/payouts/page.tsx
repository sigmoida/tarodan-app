'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { PAYOUT_TABS } from './_lib/types';
import { PayoutsSummary } from './_components/PayoutsSummary';
import { PayoutsExport } from './_components/PayoutsExport';
import { TransactionsTab } from './_components/TransactionsTab';
import { ScheduleTab } from './_components/ScheduleTab';

export default function PayoutsPage() {
  const [tab, setTab] = useTabParam('transactions');

  return (
    <AdminPage>
      <PageHeader
        title="Satıcı Ödemeleri"
        description="Escrow'da tutulan ödemeler ve serbest bırakma takvimi"
      >
        <PayoutsExport />
      </PageHeader>

      <PayoutsSummary />

      <AdminTabs tabs={PAYOUT_TABS} value={tab} onChange={setTab} />

      {tab === 'schedule' ? <ScheduleTab /> : <TransactionsTab />}
    </AdminPage>
  );
}
