'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { useTabParam } from '@/hooks/useTabParam';
import { REVIEW_TABS } from './_lib/types';
import { ProductReviewsTab } from './_components/ProductReviewsTab';
import { SellerReviewsTab } from './_components/SellerReviewsTab';

export default function ReviewsPage() {
  const [tab, setTab] = useTabParam('product');

  return (
    <AdminPage>
      <PageHeader title="Yorumlar" description="Ürün ve satıcı yorumlarını yönetin" />
      <AdminTabs tabs={REVIEW_TABS} value={tab} onChange={setTab} />

      {tab === 'seller' ? <SellerReviewsTab /> : <ProductReviewsTab />}
    </AdminPage>
  );
}
