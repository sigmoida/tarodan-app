'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Spinner } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { SectionCard } from '@/components/detail/SectionCard';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { TierCard } from './_components/TierCard';
import { TierFormModal } from './_modals/TierFormModal';
import { type MembershipTier } from './_lib/types';

/** Pull yearly_discount_percentage out of the settings payload (array or object). */
function parseYearlyDiscount(raw: unknown): number {
  if (Array.isArray(raw)) {
    const entry = (raw as Array<Record<string, unknown>>).find(
      (s) => (s.settingKey ?? s.key) === 'yearly_discount_percentage',
    );
    const v = parseFloat(String(entry?.settingValue ?? entry?.value ?? ''));
    return Number.isNaN(v) ? 20 : v;
  }
  if (raw && typeof raw === 'object') {
    const v = (raw as Record<string, unknown>).yearly_discount_percentage;
    return v != null ? Number(v) : 20;
  }
  return 20;
}

export default function MembershipTiersPage() {
  const [editing, setEditing] = useState<MembershipTier | null>(null);
  const [discount, setDiscount] = useState(20);

  const { data: tiers = [], isLoading } = useQuery<MembershipTier[]>({
    queryKey: ['membership-tiers'],
    queryFn: async () => {
      const res = await adminApi.getMembershipTiers();
      return res.data?.data || res.data || [];
    },
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
        <div className="flex items-center justify-center py-16">
          <Spinner size="xl" />
        </div>
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
