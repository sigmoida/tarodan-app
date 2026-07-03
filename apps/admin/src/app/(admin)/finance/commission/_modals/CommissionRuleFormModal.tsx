'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormContext } from 'react-hook-form';
import { Input } from '@tarodan/ui';
import { FormInput, FormSelect, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { fmtTry } from '@/lib/format';
import {
  type Category,
  type CommissionRule,
  type CommissionFormValues,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  commissionFormToPayload,
  SELLER_TYPES,
  APPLIES_TO_OPTIONS,
} from '../_lib/types';

/** Live commission preview for an example price, reading the current form values. */
function PreviewCalculator() {
  const { watch } = useFormContext<CommissionFormValues>();
  const [price, setPrice] = useState('');

  const p = parseFloat(price);
  const sellerRate = parseFloat(watch('sellerRate')) || 0;
  const buyerRate = parseFloat(watch('buyerRate')) || 0;
  const sellerMin = watch('sellerMin');
  const sellerMax = watch('sellerMax');
  const buyerMin = watch('buyerMin');
  const buyerMax = watch('buyerMax');
  const appliesTo = watch('appliesTo');

  let preview: { sellerFee: number; buyerFee: number; total: number } | null = null;
  if (price && !Number.isNaN(p) && p > 0) {
    let seller = p * (sellerRate / 100);
    let buyer = p * (buyerRate / 100);
    if (sellerMin) seller = Math.max(seller, parseFloat(sellerMin));
    if (sellerMax) seller = Math.min(seller, parseFloat(sellerMax));
    if (buyerMin) buyer = Math.max(buyer, parseFloat(buyerMin));
    if (buyerMax) buyer = Math.min(buyer, parseFloat(buyerMax));
    if (appliesTo === 'SELLER') buyer = 0;
    if (appliesTo === 'BUYER') seller = 0;
    const round = (n: number) => Math.round(n * 100) / 100;
    preview = { sellerFee: round(seller), buyerFee: round(buyer), total: round(seller + buyer) };
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-muted">Önizleme Hesaplayıcı</h3>
      <Input
        type="number"
        step="0.01"
        min="0"
        label="Örnek Ürün Fiyatı (₺)"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="1000"
      />
      {preview && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Satıcı Komisyonu:</span>
            <span className="font-medium text-heading">{fmtTry(preview.sellerFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Alıcı Komisyonu:</span>
            <span className="font-medium text-heading">{fmtTry(preview.buyerFee)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-medium text-muted">Toplam Komisyon:</span>
            <span className="font-bold text-primary-700">{fmtTry(preview.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Create/edit commission rule. Mount with `key={rule?.id ?? 'new'}` so defaults seed fresh. */
export function CommissionRuleFormModal({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommissionRule;
}) {
  const isEdit = Boolean(rule);
  const form = useZodForm(commissionSchema, {
    defaultValues: rule ? ruleToForm(rule) : emptyCommissionForm,
  });
  const appliesTo = form.watch('appliesTo');
  const showSeller = appliesTo === 'SELLER' || appliesTo === 'BOTH';
  const showBuyer = appliesTo === 'BUYER' || appliesTo === 'BOTH';

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-min'],
    queryFn: async () => {
      const res = await adminApi.getCategories();
      const list = res.data?.data || res.data || [];
      return (Array.isArray(list) ? list : []) as Category[];
    },
  });

  const save = useAdminMutation(
    (v: CommissionFormValues) =>
      isEdit
        ? adminApi.updateCommissionRule(rule!.id, commissionFormToPayload(v))
        : adminApi.createCommissionRule(commissionFormToPayload(v)),
    {
      invalidates: ['commission-rules'],
      successMessage: isEdit ? 'Komisyon kuralı güncellendi' : 'Komisyon kuralı oluşturuldu',
      onSuccess: onClose,
    },
  );

  const categoryOptions = [
    { value: '', label: 'Tüm Kategoriler' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kuralı Düzenle' : 'Yeni Kural Ekle'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
      maxWidth="max-w-2xl"
    >
      <FormInput name="name" label="Kural Adı" />
      <div className="grid grid-cols-2 gap-4">
        <FormSelect name="categoryId" label="Kategori" options={categoryOptions} />
        <FormSelect name="sellerType" label="Satıcı Tipi" options={SELLER_TYPES} />
      </div>
      <FormSelect name="appliesTo" label="Komisyon Uygulanan" options={APPLIES_TO_OPTIONS} />

      {showSeller && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted">Satıcı Komisyonu</h3>
          <FormInput name="sellerRate" label="Satıcı Oranı (%)" type="number" step="0.01" />
          <div className="grid grid-cols-2 gap-4">
            <FormInput name="sellerMin" label="Satıcı Minimum (₺)" type="number" step="0.01" placeholder="Opsiyonel" />
            <FormInput name="sellerMax" label="Satıcı Maksimum (₺)" type="number" step="0.01" placeholder="Opsiyonel" />
          </div>
        </div>
      )}

      {showBuyer && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted">Alıcı Komisyonu</h3>
          <FormInput name="buyerRate" label="Alıcı Oranı (%)" type="number" step="0.01" />
          <div className="grid grid-cols-2 gap-4">
            <FormInput name="buyerMin" label="Alıcı Minimum (₺)" type="number" step="0.01" placeholder="Opsiyonel" />
            <FormInput name="buyerMax" label="Alıcı Maksimum (₺)" type="number" step="0.01" placeholder="Opsiyonel" />
          </div>
        </div>
      )}

      <PreviewCalculator />
      <FormCheckbox name="isActive" label="Kural aktif" />
    </FormModal>
  );
}
