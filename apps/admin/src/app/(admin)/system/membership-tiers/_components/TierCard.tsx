'use client';

import { Button, enumLabel, membershipTierConfig } from '@tarodan/ui';
import { PencilIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import { fmtTry } from '@/lib/format';
import { type MembershipTier, computedYearly } from '../_lib/types';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-heading">{value}</span>
    </div>
  );
}

const featurePill = 'rounded px-2 py-1 text-xs';

export function TierCard({
  tier,
  yearlyDiscount,
  onEdit,
}: {
  tier: MembershipTier;
  yearlyDiscount: number;
  onEdit: () => void;
}) {
  const isFree = tier.type === 'free';

  return (
    <SectionCard
      title={tier.name}
      actions={
        <Button variant="ghost" size="sm" onClick={onEdit} title="Düzenle">
          <PencilIcon className="h-5 w-5" />
        </Button>
      }
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">{enumLabel(membershipTierConfig, tier.type)}</p>

      {tier.description && <p className="text-sm text-muted">{tier.description}</p>}

      <div className="space-y-2 text-sm">
        {!isFree && (
          <>
            <Row label="Aylık:" value={fmtTry(tier.monthlyPrice)} />
            <Row label="Yıllık:" value={fmtTry(computedYearly(tier.monthlyPrice, yearlyDiscount))} />
          </>
        )}
        <Row label="Ücretsiz İlan:" value={tier.maxFreeListings} />
        <Row
          label="Toplam İlan:"
          value={tier.maxTotalListings === -1 ? 'Sınırsız' : tier.maxTotalListings}
        />
        <Row label="Görsel/İlan:" value={tier.maxImagesPerListing} />
        <div className="border-t border-border pt-2">
          <Row label="Kullanıcı Sayısı:" value={<span className="font-medium">{tier.userCount}</span>} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {tier.canCreateCollections && (
          <span className={`${featurePill} bg-success-50 text-success-700`}>Koleksiyon</span>
        )}
        {tier.canTrade && <span className={`${featurePill} bg-info-50 text-info-700`}>Takas</span>}
        {tier.isAdFree && (
          <span className={`${featurePill} bg-primary-50 text-primary-700`}>Reklamsız</span>
        )}
        {!tier.isActive && (
          <span className={`${featurePill} bg-surface-alt text-muted`}>Pasif</span>
        )}
      </div>
    </SectionCard>
  );
}
