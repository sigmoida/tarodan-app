'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { SUPPORT_TABS } from './_lib/types';
import { TicketsTab } from './_components/TicketsTab';
import { GuestContactsTab } from './_components/GuestContactsTab';

export default function SupportPage() {
  const [tab, setTab] = useTabParam('tickets');

  return (
    <AdminPage>
      <PageHeader
        title="Destek Talepleri"
        description="Kullanıcı destek taleplerini ve misafir mesajlarını tek yerden yönetin"
      />
      <AdminTabs tabs={SUPPORT_TABS} value={tab} onChange={setTab} />

      {tab === 'guest' ? <GuestContactsTab /> : <TicketsTab />}
    </AdminPage>
  );
}
