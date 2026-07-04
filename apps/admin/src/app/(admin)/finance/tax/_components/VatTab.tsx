'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataTable } from '@/components/DataTable';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { vatColumns } from '../_lib/columns';
import { type VatConfig, type VatOverride, type Category } from '../_lib/types';

const validRate = (v: string) => {
  const r = parseFloat(v);
  if (Number.isNaN(r) || r < 0 || r > 100) {
    toast.error('Oran 0 ile 100 arasında olmalı');
    return null;
  }
  return r;
};

export function VatTab() {
  const confirm = useConfirm();

  const { data: config } = useQuery({
    queryKey: ['vat-config'],
    queryFn: async () => (await adminApi.getVatConfig()).data as VatConfig,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-min'],
    queryFn: async () => {
      const res = await adminApi.getCategories();
      const list = res.data?.data || res.data || [];
      return (Array.isArray(list) ? list : []) as Category[];
    },
  });

  const [vatDefault, setVatDefault] = useState('20');
  const [ovCategoryId, setOvCategoryId] = useState('');
  const [ovRate, setOvRate] = useState('0');

  useEffect(() => {
    if (config?.defaultRate != null) setVatDefault(String(config.defaultRate));
  }, [config?.defaultRate]);

  const saveDefault = useAdminMutation((rate: number) => adminApi.setDefaultVat(rate), {
    invalidates: ['vat-config'],
    successMessage: 'Varsayılan KDV oranı güncellendi',
  });
  const addOverride = useAdminMutation(
    (v: { categoryId: string; rate: number }) => adminApi.setVatOverride(v.categoryId, v.rate),
    {
      invalidates: ['vat-config'],
      successMessage: 'Kategori istisnası kaydedildi',
      onSuccess: () => {
        setOvCategoryId('');
        setOvRate('0');
      },
    },
  );
  const removeOverride = useAdminMutation((ruleId: string) => adminApi.deleteVatOverride(ruleId), {
    invalidates: ['vat-config'],
    successMessage: 'Silindi',
  });

  const onSaveDefault = () => {
    const r = validRate(vatDefault);
    if (r != null) saveDefault.mutate(r);
  };
  const onAddOverride = () => {
    if (!ovCategoryId) {
      toast.error('Kategori seçin');
      return;
    }
    const r = validRate(ovRate);
    if (r != null) addOverride.mutate({ categoryId: ovCategoryId, rate: r });
  };
  const onDelete = async (o: VatOverride) => {
    if (
      await confirm({
        title: `"${o.categoryName}" KDV istisnası silinsin mi?`,
        description: 'Bu kategori tekrar varsayılan KDV oranına döner.',
        confirmLabel: 'Sil',
        destructive: true,
      })
    )
      removeOverride.mutate(o.ruleId);
  };

  const columns = vatColumns(onDelete);

  return (
    <div className="space-y-6">
      <SectionCard title="Varsayılan KDV Oranı" bodyClassName="space-y-4">
        <p className="text-sm text-muted">
          Tarodan&apos;ın kestiği komisyon/hizmet bedeli e-belgeleri ve kurumsal satıcı
          siparişlerindeki KDV bu oranla hesaplanır. Bireysel satıcı satışlarında KDV
          uygulanmaz.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            label="KDV Oranı (%)"
            value={vatDefault}
            onChange={(e) => setVatDefault(e.target.value)}
            className="w-32"
          />
          <Button onClick={onSaveDefault} isLoading={saveDefault.isPending}>
            Kaydet
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Kategori Bazlı İstisnalar" bodyClassName="space-y-4">
        <p className="text-sm text-muted">
          Belirli kategorilerde farklı KDV oranı gerekiyorsa (örn. kitap %0) buradan
          tanımlayın. Tanımsız kategoriler varsayılan oranı kullanır.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Kategori"
            value={ovCategoryId}
            onChange={(e) => setOvCategoryId(e.target.value)}
            placeholder="Seçin"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            className="min-w-48"
          />
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            label="KDV Oranı (%)"
            value={ovRate}
            onChange={(e) => setOvRate(e.target.value)}
            className="w-32"
          />
          <Button onClick={onAddOverride} isLoading={addOverride.isPending}>
            Ekle / Güncelle
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={config?.overrides ?? []}
          getRowId={(o) => o.ruleId}
          emptyText="Kategori istisnası yok — tüm kategoriler varsayılan oranı kullanıyor."
        />
      </SectionCard>
    </div>
  );
}
