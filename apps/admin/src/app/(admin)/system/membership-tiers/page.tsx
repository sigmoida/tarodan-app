'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageLoading } from '@/components/PageLoading';
import { PageHeader } from '@/components/AdminList';
import { SectionCard } from '@/components/detail/SectionCard';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { readSetting } from '@/lib/settings';
import { extractList } from '@/lib/extract';
import { TierCard } from './_components/TierCard';
import { TierFormModal } from './_modals/TierFormModal';
import { type MembershipTier } from './_lib/types';

/** Pull yearly_discount_percentage out of the settings payload (array or object). */
function parseYearlyDiscount(raw: unknown): number {
  const v = readSetting(raw, 'yearly_discount_percentage');
  const n = v != null ? parseFloat(v) : NaN;
  return Number.isNaN(n) ? 20 : n;
}

export default function MembershipTiersPage() {
  const [editing, setEditing] = useState<MembershipTier | null>(null);
  const [discount, setDiscount] = useState(20);

  const { data: tiers = [], isLoading } = useQuery<MembershipTier[]>({
    queryKey: ['membership-tiers'],
    queryFn: async () => extractList<MembershipTier>(await adminApi.getMembershipTiers()),
  });

  const { data: yearlyDiscount = 20 } = useQuery({
    queryKey: ['membership-yearly-discount'],
    queryFn: async () => {
      const res = await adminApi.getSettings();
      return parseYearlyDiscount(res.data?.data ?? res.data ?? []);
    },
  });
  useEffect(() => setDiscount(yearlyDiscount), [yearlyDiscount]);

  const saveDiscount = useAdminMutation(
    (pct: number) => adminApi.updateSetting('yearly_discount_percentage', String(pct)),
    {
      // backend also recomputes every tier's yearlyPrice
      invalidates: ['membership-yearly-discount', 'membership-tiers'],
      successMessage: 'Yıllık indirim oranı güncellendi',
    },
  );

  return (
    <AdminPage>
      <PageHeader title="Üyelik Katmanları" description="Üyelik katmanlarını ve fiyatlarını yönetin" />

      <SectionCard title="Yıllık İndirim Oranı" bodyClassName="space-y-3">
        <div className="flex items-end gap-4">
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            label="İndirim Yüzdesi (%)"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className="w-48"
          />
          <Button onClick={() => saveDiscount.mutate(discount)} isLoading={saveDiscount.isPending}>
            Kaydet
          </Button>
        </div>
        <p className="text-xs text-muted">
          Yıllık fiyat = Aylık Fiyat × 12 × (1 − İndirim%) · Değiştirildiğinde tüm katmanların yıllık
          fiyatı otomatik güncellenir.
        </p>
      </SectionCard>

      {isLoading ? (
        <PageLoading />
      ) : tiers.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">Henüz üyelik katmanı yok</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              yearlyDiscount={yearlyDiscount}
              onEdit={() => setEditing(tier)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TierFormModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          tier={editing}
          yearlyDiscount={yearlyDiscount}
        />
      )}
    </AdminPage>
  );
}
