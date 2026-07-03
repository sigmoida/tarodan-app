'use client';

import { useState } from 'react';
import { Select, Spinner } from '@tarodan/ui';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { AdminTabs } from '@/components/AdminTabs';
import {
  type DateRange,
  DATE_RANGE_OPTIONS,
  ANALYTICS_TABS,
} from './_lib/types';
import { useAnalytics } from './_lib/useAnalytics';
import { AnalyticsExport } from './_components/AnalyticsExport';
import { SalesTab } from './_components/SalesTab';
import { UsersTab } from './_components/UsersTab';
import { ProductsTab } from './_components/ProductsTab';
import { TradesTab } from './_components/TradesTab';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [tab, setTab] = useState('sales');
  const { data, loading } = useAnalytics(dateRange);

  return (
    <AdminPage>
      <PageHeader
        title="Analizler"
        description="Detaylı satış, kullanıcı ve ürün analizleri"
      >
        <AnalyticsExport dateRange={dateRange} activeTab={tab} />
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AdminTabs tabs={ANALYTICS_TABS} value={tab} onChange={setTab} />
        <Select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          options={DATE_RANGE_OPTIONS}
          className="sm:w-40"
        />
      </div>

      {loading || !data ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="xl" />
        </div>
      ) : (
        <>
          {tab === 'sales' && <SalesTab report={data.salesReport} />}
          {tab === 'users' && <UsersTab report={data.userReport} />}
          {tab === 'products' && <ProductsTab report={data.productReport} />}
          {tab === 'trades' && <TradesTab report={data.tradeReport} />}
        </>
      )}
    </AdminPage>
  );
}
