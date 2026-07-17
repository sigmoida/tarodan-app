import { type ComponentType } from 'react';
import Link from 'next/link';
import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ArrowsRightLeftIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { type PendingActions } from '../_lib/types';

type Tone = 'warning' | 'primary' | 'info';

const TONES: Record<Tone, { wrap: string; box: string; icon: string; text: string; link: string }> = {
  warning: {
    wrap: 'border-warning-700 bg-warning-900/20',
    box: 'bg-warning-500/20',
    icon: 'text-warning-700',
    text: 'text-warning-700',
    link: 'text-warning-500',
  },
  primary: {
    wrap: 'border-primary-700 bg-primary-900/20',
    box: 'bg-primary-500/20',
    icon: 'text-primary-700',
    text: 'text-primary-700',
    link: 'text-primary-500',
  },
  info: {
    wrap: 'border-info-700 bg-info-900/20',
    box: 'bg-info-500/20',
    icon: 'text-info-700',
    text: 'text-info-700',
    link: 'text-info-500',
  },
};

function PendingCard({
  tone,
  icon: Icon,
  message,
  href,
  reviewLabel,
}: {
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  message: string;
  href: string;
  reviewLabel: string;
}) {
  const tone_ = TONES[tone];
  return (
    <div className={`flex items-center rounded-lg border p-4 ${tone_.wrap}`}>
      <div className={`mr-4 shrink-0 rounded-lg p-2 ${tone_.box}`}>
        <Icon className={`h-6 w-6 ${tone_.icon}`} />
      </div>
      <div className="min-w-0">
        <p className={`font-medium ${tone_.text}`}>{message}</p>
        <Link href={href} className={`text-sm hover:underline ${tone_.link}`}>
          {reviewLabel} →
        </Link>
      </div>
    </div>
  );
}

export function PendingActionsPanel({ pending }: { pending: PendingActions | null }) {
  const t = useTranslations();
  if (!pending || pending.totalPending <= 0) return null;

  const reviewLabel = t('admin.dashboard.pendingActions.review');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {pending.pendingProducts > 0 && (
        <PendingCard
          tone="warning"
          icon={ShoppingBagIcon}
          message={t('admin.dashboard.pendingActions.productsPending', {
            count: pending.pendingProducts,
          })}
          href="/catalog/products?status=pending"
          reviewLabel={reviewLabel}
        />
      )}
      {pending.refundRequests > 0 && (
        <PendingCard
          tone="primary"
          icon={CurrencyDollarIcon}
          message={t('admin.dashboard.pendingActions.refundRequests', {
            count: pending.refundRequests,
          })}
          href="/operations/orders?status=refund_requested"
          reviewLabel={reviewLabel}
        />
      )}
      {(pending.pendingMessages ?? 0) > 0 && (
        <PendingCard
          tone="info"
          icon={ArrowsRightLeftIcon}
          message={t('admin.dashboard.pendingActions.messagesPending', {
            count: pending.pendingMessages ?? 0,
          })}
          href="/messaging/messages"
          reviewLabel={reviewLabel}
        />
      )}
      {(pending.identityVerificationRequests ?? 0) > 0 && (
        <PendingCard
          tone="info"
          icon={UsersIcon}
          message={t('admin.dashboard.pendingActions.identityVerification', {
            count: pending.identityVerificationRequests ?? 0,
          })}
          href="/accounts/users?status=pending_verification"
          reviewLabel={reviewLabel}
        />
      )}
    </div>
  );
}
