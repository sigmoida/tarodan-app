'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { INVOICE_TABS } from './_lib/types';
import { ElogoInvoicesTab } from './_components/ElogoInvoicesTab';
import { SellerInvoicesTab } from './_components/SellerInvoicesTab';

export default function InvoicesPage() {
  const [tab, setTab] = useTabParam('elogo');

  return (
    <AdminPage>
      <PageHeader
        title="Faturalar"
        description="e-Arşiv / e-Fatura belgeleri ve satıcı yüklemesi faturaları"
      />
      <AdminTabs tabs={INVOICE_TABS} value={tab} onChange={setTab} />

      {tab === 'seller' ? <SellerInvoicesTab /> : <ElogoInvoicesTab />}
    </AdminPage>
  );
}
