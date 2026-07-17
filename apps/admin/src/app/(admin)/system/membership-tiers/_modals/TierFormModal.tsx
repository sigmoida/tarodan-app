'use client';

import { useTranslations } from 'next-intl';
import { FormModal, FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
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
  const t = useTranslations();
  const isFree = tier.type === 'free';
  const form = useZodForm(tierSchema(t), { defaultValues: tierToForm(tier) });
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
      successMessage: t('admin.tiers.modal.saved'),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t('admin.tiers.modal.editTitle', { name: tier.name })}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={t('common.update')}
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-2 gap-4">
        <FormInput name="name" label={t('admin.tiers.field.name')} />
        <FormInput name="sortOrder" label={t('admin.tiers.field.sortOrder')} type="number" />
      </div>

      <FormTextarea name="description" label={t('common.description')} rows={2} />

      {!isFree && (
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="monthlyPrice"
            label={t('admin.tiers.field.monthlyPrice')}
            type="number"
            step="0.01"
            min="0"
          />
          <div>
            <span className="mb-1 block text-sm text-muted">
              {t('admin.tiers.field.yearlyPrice')}{' '}
              <span className="text-xs text-subtle">{t('admin.tiers.field.automatic')}</span>
            </span>
            <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-muted">
              {fmtTry(yearly)}
            </div>
            <p className="mt-1 text-xs text-subtle">
              {t('admin.tiers.field.yearlyFormula', {
                monthly,
                discount: yearlyDiscount,
                yearly: fmtTry(yearly),
              })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <FormInput name="maxFreeListings" label={t('admin.tiers.field.maxFreeListings')} type="number" />
        <FormInput
          name="maxTotalListings"
          label={t('admin.tiers.field.maxTotalListings')}
          type="number"
          min="-1"
          helperText={t('admin.tiers.field.maxTotalListingsHelper')}
        />
        <FormInput
          name="maxImagesPerListing"
          label={t('admin.tiers.field.maxImagesPerListing')}
          type="number"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormInput
          name="featuredListingSlots"
          label={t('admin.tiers.field.featuredListingSlots')}
          type="number"
        />
        <FormInput
          name="commissionDiscount"
          label={t('admin.tiers.field.commissionDiscount')}
          type="number"
          step="0.0001"
        />
      </div>

      <div className="space-y-2">
        <FormCheckbox name="canCreateCollections" label={t('admin.tiers.field.canCreateCollections')} />
        <FormCheckbox name="canTrade" label={t('admin.tiers.field.canTrade')} />
        <FormCheckbox name="isAdFree" label={t('admin.tiers.field.isAdFree')} />
        <FormCheckbox name="isActive" label={t('common.active')} />
      </div>
    </FormModal>
  );
}
