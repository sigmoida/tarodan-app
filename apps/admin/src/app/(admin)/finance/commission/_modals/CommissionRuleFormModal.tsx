'use client';

import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Input, Select } from '@tarodan/ui';
import { FormModal, FormInput, FormSelect, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useCategories } from '@/hooks/useCategories';
import { fmtTry } from '@/lib/format';
import { adminKeys } from '@/lib/query/keys';
import {
  type CommissionRule,
  type CommissionFormValues,
  type Category,
  type SellerType,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  commissionFormToPayload,
  SELLER_TYPES,
  APPLIES_TO_OPTIONS,
} from '../_lib/types';

interface CommissionPreview {
  sellerFeeAmount: number;
  buyerFeeAmount: number;
  commissionAmount: number;
}

/** Live checkout-equivalent preview, including independently matched buyer/seller rules. */
function PreviewCalculator({
  ruleId,
  categories,
}: {
  ruleId?: string;
  categories: Category[];
}) {
  const { watch } = useFormContext<CommissionFormValues>();
  const [price, setPrice] = useState('');
  const [debouncedPrice, setDebouncedPrice] = useState(0);
  const [previewCategoryId, setPreviewCategoryId] = useState('');
  const [previewSellerType, setPreviewSellerType] =
    useState<Exclude<SellerType, 'ALL'>>('FREE');
  const values = watch();

  useEffect(() => {
    const parsedPrice = parseFloat(price);
    const timer = setTimeout(
      () =>
        setDebouncedPrice(
          Number.isNaN(parsedPrice) || parsedPrice <= 0 ? 0 : parsedPrice,
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [price]);

  const effectiveCategoryId = values.categoryId || previewCategoryId;
  const effectiveSellerType =
    values.sellerType === 'ALL' ? previewSellerType : values.sellerType;
  const hasRequiredRates =
    !(
      (values.appliesTo === 'SELLER' || values.appliesTo === 'BOTH') &&
      !values.sellerRate
    ) &&
    !(
      (values.appliesTo === 'BUYER' || values.appliesTo === 'BOTH') &&
      !values.buyerRate
    );
  const draft = commissionFormToPayload(values);

  const previewQuery = useQuery<CommissionPreview>({
    queryKey: adminKeys.preview('commission-rules', {
      ruleId: ruleId ?? 'new',
      amount: debouncedPrice,
      categoryId: effectiveCategoryId,
      sellerType: effectiveSellerType,
      draft: {
        categoryId: draft.categoryId,
        sellerType: draft.sellerType,
        appliesTo: draft.appliesTo,
        sellerRate: draft.sellerRate,
        buyerRate: draft.buyerRate,
        sellerMin: draft.sellerMin,
        sellerMax: draft.sellerMax,
        buyerMin: draft.buyerMin,
        buyerMax: draft.buyerMax,
        isActive: draft.isActive,
      },
    }),
    queryFn: async () => {
      const response = await adminApi.previewCommission({
        amount: debouncedPrice,
        ruleId,
        categoryId: draft.categoryId,
        sellerType: draft.sellerType,
        appliesTo: draft.appliesTo,
        sellerRate: draft.sellerRate,
        buyerRate: draft.buyerRate,
        sellerMin: draft.sellerMin,
        sellerMax: draft.sellerMax,
        buyerMin: draft.buyerMin,
        buyerMax: draft.buyerMax,
        isActive: draft.isActive,
        previewCategoryId: effectiveCategoryId || null,
        previewSellerType: effectiveSellerType,
      });
      return response.data;
    },
    enabled: debouncedPrice > 0 && hasRequiredRates,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const preview = previewQuery.data;
  const categoryOptions = [
    { value: '', label: 'Kategori seçilmedi' },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-muted">Önizleme Hesaplayıcı</h3>
      <p className="text-xs text-muted">
        Aktif kurallar, checkout&apos;taki gibi satıcı ve alıcı için ayrı ayrı eşleştirilir.
      </p>
      {values.categoryId === '' && (
        <Select
          label="Örnek Ürün Kategorisi"
          value={previewCategoryId}
          onChange={(event) => setPreviewCategoryId(event.target.value)}
          options={categoryOptions}
        />
      )}
      {values.sellerType === 'ALL' && (
        <Select
          label="Örnek Satıcı Tipi"
          value={previewSellerType}
          onChange={(event) =>
            setPreviewSellerType(event.target.value as Exclude<SellerType, 'ALL'>)
          }
          options={SELLER_TYPES.filter((option) => option.value !== 'ALL')}
        />
      )}
      <Input
        type="number"
        step="0.01"
        min="0"
        label="Örnek Ürün Fiyatı (₺)"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="1000"
      />
      {previewQuery.isFetching && <p className="text-sm text-muted">Hesaplanıyor...</p>}
      {previewQuery.isError && (
        <p className="text-sm text-danger-600">Komisyon önizlemesi hesaplanamadı.</p>
      )}
      {preview && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Satıcı Komisyonu:</span>
            <span className="font-medium text-heading">{fmtTry(preview.sellerFeeAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Alıcı Komisyonu:</span>
            <span className="font-medium text-heading">{fmtTry(preview.buyerFeeAmount)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-medium text-muted">Toplam Komisyon:</span>
            <span className="font-bold text-primary-700">{fmtTry(preview.commissionAmount)}</span>
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

  const { data: categories = [] } = useCategories();

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

      <PreviewCalculator ruleId={rule?.id} categories={categories} />
      <FormCheckbox name="isActive" label="Kural aktif" />
    </FormModal>
  );
}
