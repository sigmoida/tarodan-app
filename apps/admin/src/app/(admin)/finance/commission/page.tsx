'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Spinner } from '@tarodan/ui';
import { PlusIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { CommissionSummary } from './_components/CommissionSummary';
import { TradeRateCard } from './_components/TradeRateCard';
import { CommissionTable } from './_components/CommissionTable';
import { CommissionRuleFormModal } from './_modals/CommissionRuleFormModal';
import { type CommissionRule, isDefaultRule } from './_lib/types';

export default function CommissionPage() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ rule?: CommissionRule } | null>(null);

  const { data: rules = [], isLoading } = useQuery<CommissionRule[]>({
    queryKey: ['commission-rules'],
    queryFn: async () => {
      const res = await adminApi.getCommissionRules();
      return res.data?.data || res.data || [];
    },
  });

  const toggle = useAdminMutation(
    (rule: CommissionRule) => adminApi.updateCommissionRule(rule.id, { isActive: !rule.isActive }),
    { invalidates: ['commission-rules'], successMessage: 'Kural durumu güncellendi' },
  );

  const remove = useAdminMutation((id: string) => adminApi.deleteCommissionRule(id), {
    invalidates: ['commission-rules'],
    successMessage: 'Komisyon kuralı silindi',
  });

  const onDelete = async (rule: CommissionRule) => {
    if (
      await confirm({
        title: 'Kuralı Sil',
        description: 'Bu komisyon kuralını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        confirmLabel: 'Sil',
        destructive: true,
      })
    )
      remove.mutate(rule.id);
  };

  const hasDefaultRule = rules.some(isDefaultRule);

  return (
    <AdminPage>
      <PageHeader title="Komisyon Yönetimi" description="Platform komisyon oranlarını yönetin">
        <Button leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
          Yeni Kural Ekle
        </Button>
      </PageHeader>

      <CommissionSummary />

      <Alert
        variant="info"
        title="Komisyon Hesaplama"
        icon={<InformationCircleIcon className="h-5 w-5" />}
      >
        Komisyon kuralları eşleşme sırasına göre değerlendirilir. Bir sipariş için ilk eşleşen
        kural uygulanır. Eşleşme sırası: Kategori + Satıcı Tipi &gt; Kategori + Tümü &gt; Satıcı
        Tipi &gt; Varsayılan (Tümü + Tümü). Aynı kombinasyon (kategori + satıcı tipi) için sadece
        bir kural oluşturulabilir.
      </Alert>

      <TradeRateCard />

      {!hasDefaultRule && (
        <Alert
          variant="warning"
          title="Varsayılan komisyon kuralı tanımlı değil"
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
        >
          Eşleşen kural olmayan siparişler 0 komisyon ile oluşturulacaktır. Checkout ve ödeme akışı
          etkilenmez. İsterseniz &quot;Kategori: Tümü&quot; ve &quot;Satıcı Tipi: Tümü&quot; ile bir
          varsayılan kural ekleyebilirsiniz.
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="xl" />
        </div>
      ) : (
        <CommissionTable
          rules={rules}
          onEdit={(rule) => setModal({ rule })}
          onDelete={onDelete}
          onToggle={(rule) => toggle.mutate(rule)}
          togglingId={toggle.isPending ? toggle.variables?.id : undefined}
        />
      )}

      {modal && (
        <CommissionRuleFormModal
          key={modal.rule?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          rule={modal.rule}
        />
      )}
    </AdminPage>
  );
}
