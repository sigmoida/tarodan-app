'use client';

import { FormInput, FormSelect, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useCategories } from '@/hooks/useCategories';
import { FormModal } from '@/components/form/FormModal';
import { discountSchema, type DiscountFormValues } from '../_lib/schema';
import { discountTypeOptions, scopeFormOptions, type Discount } from '../_lib/types';

const isoDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/** Discount → form defaults (numerics converted to strings). */
function toDefaults(d?: Discount): DiscountFormValues {
  if (!d) {
    return {
      code: '',
      name: '',
      description: '',
      type: 'percentage',
      value: '10',
      scope: 'global',
      categoryId: '',
      minCartValue: '',
      minQuantity: '',
      buyQuantity: '',
      getQuantity: '',
      maxDiscountAmount: '',
      usageLimitTotal: '',
      usageLimitPerUser: '1',
      isStackable: false,
      isActive: true,
      isFlashSale: false,
      startDate: isoDate(),
      endDate: isoDate(30),
    };
  }
  return {
    code: d.code ?? '',
    name: d.name,
    description: d.description ?? '',
    type: d.type,
    value: String(d.value),
    scope: d.scope === 'category' ? 'category' : 'global',
    categoryId: d.categoryId ?? '',
    minCartValue: d.minCartValue?.toString() ?? '',
    minQuantity: d.minQuantity?.toString() ?? '',
    buyQuantity: d.buyQuantity?.toString() ?? '',
    getQuantity: d.getQuantity?.toString() ?? '',
    maxDiscountAmount: d.maxDiscountAmount?.toString() ?? '',
    usageLimitTotal: d.usageLimitTotal?.toString() ?? '',
    usageLimitPerUser: d.usageLimitPerUser.toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    isFlashSale: d.isFlashSale,
    startDate: d.startDate.split('T')[0],
    endDate: d.endDate.split('T')[0],
  };
}

/** Convert form values into the backend payload (string→number/ISO). */
function toPayload(v: DiscountFormValues) {
  return {
    code: v.code.trim() ? v.code.trim().toUpperCase() : null,
    name: v.name,
    description: v.description || undefined,
    type: v.type,
    value: parseFloat(v.value) || 0,
    scope: v.scope,
    categoryId: v.scope === 'category' ? v.categoryId : undefined,
    minCartValue: v.minCartValue ? parseFloat(v.minCartValue) : undefined,
    minQuantity: v.minQuantity ? parseInt(v.minQuantity) : undefined,
    buyQuantity: v.buyQuantity ? parseInt(v.buyQuantity) : undefined,
    getQuantity: v.getQuantity ? parseInt(v.getQuantity) : undefined,
    maxDiscountAmount: v.maxDiscountAmount ? parseFloat(v.maxDiscountAmount) : undefined,
    usageLimitTotal: v.usageLimitTotal ? parseInt(v.usageLimitTotal) : undefined,
    usageLimitPerUser: parseInt(v.usageLimitPerUser) || 1,
    isStackable: v.isStackable,
    priority: 0,
    isActive: v.isActive,
    isFlashSale: v.isFlashSale,
    startDate: new Date(v.startDate).toISOString(),
    endDate: new Date(v.endDate + 'T23:59:59').toISOString(),
  };
}

/** Create/edit discount. Mount with `key={discount?.id ?? 'new'}` so defaults seed fresh. */
export function DiscountFormModal({
  open,
  onClose,
  discount,
}: {
  open: boolean;
  onClose: () => void;
  discount?: Discount;
}) {
  const isEdit = Boolean(discount);
  const form = useZodForm(discountSchema, { defaultValues: toDefaults(discount) });
  const { data: categories = [] } = useCategories();

  const type = form.watch('type');
  const scope = form.watch('scope');

  const save = useAdminMutation(
    (v: DiscountFormValues) =>
      isEdit
        ? adminApi.patch(`/admin/discounts/${discount!.id}`, toPayload(v))
        : adminApi.post('/admin/discounts', toPayload(v)),
    {
      invalidates: ['discounts'],
      successMessage: isEdit ? 'İndirim güncellendi' : 'İndirim oluşturuldu',
      errorMessage: 'İndirim kaydedilirken hata oluştu',
      onSuccess: onClose,
    },
  );

  const categoryOptions = [
    { value: '', label: 'Kategori seçin' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'İndirimi Düzenle' : 'Yeni İndirim Oluştur'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput name="name" label="İndirim Adı" placeholder="Örn: Yılbaşı İndirimi" />
        <FormInput
          name="code"
          label="Kupon Kodu (Opsiyonel)"
          placeholder="Örn: YILBASI2026"
          className="font-mono uppercase"
          helperText="Kodsuz (otomatik) kampanyalar devre dışı; indirim için kupon kodu girin."
        />
      </div>

      <FormTextarea name="description" label="Açıklama" rows={2} placeholder="İndirim açıklaması..." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect name="type" label="İndirim Türü" options={discountTypeOptions} />
        <FormInput
          name="value"
          type="number"
          min="0"
          max={type === 'percentage' || type === 'bogo' ? 100 : 10000}
          step={type === 'percentage' || type === 'bogo' ? 1 : 0.01}
          label={type === 'bogo' ? 'İndirim Oranı (2. Üründe)' : 'Değer'}
          placeholder={type === 'bogo' ? '100 = Bedava' : ''}
          helperText={type === 'bogo' ? '100 = Tamamen bedava, 50 = %50 indirimli' : undefined}
        />
      </div>

      {type === 'bogo' && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface/60 p-4 sm:grid-cols-2">
          <p className="text-sm font-medium text-primary sm:col-span-2">BOGO Ayarları (Buy X Get Y)</p>
          <FormInput name="buyQuantity" type="number" min="1" label="Kaç Adet Alınca? (Buy)" placeholder="Örn: 1" />
          <FormInput name="getQuantity" type="number" min="1" label="Kaç Adet İndirimli? (Get)" placeholder="Örn: 1" />
        </div>
      )}

      {type === 'bulk_quantity' && (
        <div className="rounded-lg border border-border bg-surface/60 p-4">
          <p className="mb-2 text-sm font-medium text-primary">Çoklu Alım Ayarları</p>
          <FormInput name="minQuantity" type="number" min="2" label="Min. Adet Sayısı" placeholder="Örn: 3 adet alımda" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect name="scope" label="Kapsam" options={scopeFormOptions} />
        {scope === 'category' && (
          <FormSelect name="categoryId" label="Kategori" options={categoryOptions} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput name="minCartValue" type="number" min="0" step="0.01" label="Min. Sepet Tutarı (TL)" placeholder="Örn: 100" />
        <FormInput name="maxDiscountAmount" type="number" min="0" step="0.01" label="Max. İndirim Tutarı (TL)" placeholder="Örn: 500" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput name="usageLimitTotal" type="number" min="1" label="Toplam Kullanım Limiti" placeholder="Sınırsız" />
        <FormInput name="usageLimitPerUser" type="number" min="1" label="Kullanıcı Başı Limit" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput name="startDate" type="date" label="Başlangıç Tarihi" />
        <FormInput name="endDate" type="date" label="Bitiş Tarihi" />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-2">
        <FormCheckbox name="isFlashSale" label="⚡ Flash Sale (Flaş İndirim)" />
        <FormCheckbox name="isStackable" label="Diğer indirimlerle kombine edilebilir" />
        <FormCheckbox name="isActive" label="Aktif" />
      </div>
    </FormModal>
  );
}
