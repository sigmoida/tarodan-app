'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { NOTIFICATION_TABS } from './_lib/types';
import { SendNotificationForm } from './_components/SendNotificationForm';
import { ScheduledTab } from './_components/ScheduledTab';
import { HistoryTab } from './_components/HistoryTab';

export default function NotificationsPage() {
  const [tab, setTab] = useTabParam('send');

  return (
    <AdminPage>
      <PageHeader
        title="Bildirim Yönetimi"
        description="Push, email ve SMS bildirimleri gönderin ve yönetin"
      />
      <AdminTabs tabs={NOTIFICATION_TABS} value={tab} onChange={setTab} />

      {tab === 'scheduled' ? (
        <ScheduledTab />
      ) : tab === 'history' ? (
        <HistoryTab />
      ) : (
        <SendNotificationForm onScheduled={() => setTab('scheduled')} />
      )}
    </AdminPage>
  );
}
