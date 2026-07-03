'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { TAX_TABS } from './_lib/types';
import { VatTab } from './_components/VatTab';
import { WithholdingTab } from './_components/WithholdingTab';
import { TaxReportTab } from './_components/TaxReportTab';

export default function TaxPage() {
  const [tab, setTab] = useTabParam('kdv');

  return (
    <AdminPage>
      <PageHeader title="Vergi Ayarları" description="KDV oranı, stopaj ve dönem raporu" />
      <AdminTabs tabs={TAX_TABS} value={tab} onChange={setTab} />

      {tab === 'withholding' ? (
        <WithholdingTab />
      ) : tab === 'report' ? (
        <TaxReportTab />
      ) : (
        <VatTab />
      )}
    </AdminPage>
  );
}
