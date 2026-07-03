'use client';

import { FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { fmtTry } from '@/lib/format';
import {
  type MembershipTier,
  type TierFormValues,
  tierSchema,
  tierToForm,
  tierFormToPayload,
  computedYearly,
  PRICE_KEY,
} from '../_lib/types';

/** Edit a membership tier. Mount with `key={tier.id}` so defaults seed fresh. */
export function TierFormModal({
  open,
  onClose,
  tier,
  yearlyDiscount,
}: {
  open: boolean;
  onClose: () => void;
  tier: MembershipTier;
  yearlyDiscount: number;
}) {
  const isFree = tier.type === 'free';
  const form = useZodForm(tierSchema, { defaultValues: tierToForm(tier) });
  const monthly = parseFloat(form.watch('monthlyPrice')) || 0;
  const yearly = computedYearly(monthly, yearlyDiscount);

  const save = useAdminMutation(
    async (v: TierFormValues) => {
      await adminApi.updateMembershipTier(tier.id, tierFormToPayload(v, computedYearly(parseFloat(v.monthlyPrice) || 0, yearlyDiscount)));
      const priceKey = PRICE_KEY[tier.type];
      if (priceKey) await adminApi.updateSetting(priceKey, String(parseFloat(v.monthlyPrice) || 0));
    },
    {
      invalidates: ['membership-tiers'],
      successMessage: 'Üyelik katmanı güncellendi',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Üyelik Katmanı Düzenle — ${tier.name}`}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel="Güncelle"
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-2 gap-4">
        <FormInput name="name" label="Ad" />
        <FormInput name="sortOrder" label="Sıralama" type="number" />
      </div>

      <FormTextarea name="description" label="Açıklama" rows={2} />

      {!isFree && (
        <div className="grid grid-cols-2 gap-4">
          <FormInput name="monthlyPrice" label="Aylık Fiyat (₺)" type="number" step="0.01" min="0" />
          <div>
            <span className="mb-1 block text-sm text-muted">
              Yıllık Fiyat (₺) <span className="text-xs text-subtle">(Otomatik)</span>
            </span>
            <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-muted">
              {fmtTry(yearly)}
            </div>
            <p className="mt-1 text-xs text-subtle">
              {monthly} × 12 × (1 − {yearlyDiscount}%) = {fmtTry(yearly)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <FormInput name="maxFreeListings" label="Ücretsiz İlan" type="number" />
        <FormInput name="maxTotalListings" label="Toplam İlan" type="number" min="-1" helperText="-1 = sınırsız" />
        <FormInput name="maxImagesPerListing" label="Görsel/İlan" type="number" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormInput name="featuredListingSlots" label="Öne Çıkan İlan Slotları" type="number" />
        <FormInput name="commissionDiscount" label="Komisyon İndirimi (%)" type="number" step="0.0001" />
      </div>

      <div className="space-y-2">
        <FormCheckbox name="canCreateCollections" label="Koleksiyon Oluşturabilir" />
        <FormCheckbox name="canTrade" label="Takas Yapabilir" />
        <FormCheckbox name="isAdFree" label="Reklamsız" />
        <FormCheckbox name="isActive" label="Aktif" />
      </div>
    </FormModal>
  );
}
