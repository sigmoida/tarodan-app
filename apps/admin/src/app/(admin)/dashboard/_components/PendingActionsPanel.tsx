import { type ComponentType } from 'react';
import Link from 'next/link';
import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ArrowsRightLeftIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
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
}: {
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  message: string;
  href: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`flex items-center rounded-lg border p-4 ${t.wrap}`}>
      <div className={`mr-4 shrink-0 rounded-lg p-2 ${t.box}`}>
        <Icon className={`h-6 w-6 ${t.icon}`} />
      </div>
      <div className="min-w-0">
        <p className={`font-medium ${t.text}`}>{message}</p>
        <Link href={href} className={`text-sm hover:underline ${t.link}`}>
          İncele →
        </Link>
      </div>
    </div>
  );
}

export function PendingActionsPanel({ pending }: { pending: PendingActions | null }) {
  if (!pending || pending.totalPending <= 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {pending.pendingProducts > 0 && (
        <PendingCard
          tone="warning"
          icon={ShoppingBagIcon}
          message={`${pending.pendingProducts} ürün onay bekliyor`}
          href="/catalog/products?status=pending"
        />
      )}
      {pending.refundRequests > 0 && (
        <PendingCard
          tone="primary"
          icon={CurrencyDollarIcon}
          message={`${pending.refundRequests} iade talebi`}
          href="/operations/orders?status=refund_requested"
        />
      )}
      {(pending.pendingMessages ?? 0) > 0 && (
        <PendingCard
          tone="info"
          icon={ArrowsRightLeftIcon}
          message={`${pending.pendingMessages} mesaj onay bekliyor`}
          href="/messaging/messages"
        />
      )}
      {(pending.identityVerificationRequests ?? 0) > 0 && (
        <PendingCard
          tone="info"
          icon={UsersIcon}
          message={`${pending.identityVerificationRequests} kimlik doğrulama talebi`}
          href="/accounts/users?status=pending_verification"
        />
      )}
    </div>
  );
}
