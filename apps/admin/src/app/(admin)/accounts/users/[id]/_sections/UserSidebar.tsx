import Link from 'next/link';
import {
  ShoppingBagIcon,
  CubeIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/detail/SectionCard';
import { type UserDetail } from '../types';

function VerifiedRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      {ok ? (
        <CheckCircleIcon className="h-5 w-5 text-success-500" />
      ) : (
        <XCircleIcon className="h-5 w-5 text-muted" />
      )}
    </div>
  );
}

export function UserSidebar({ user }: { user: UserDetail }) {
  const t = useTranslations();
  const quickLinks = [
    {
      href: `/operations/orders?userId=${user.id}`,
      icon: ShoppingBagIcon,
      label: t('admin.users.detail.allOrders', { count: user.stats?.ordersCount || 0 }),
    },
    {
      href: `/catalog/products?sellerId=${user.id}`,
      icon: CubeIcon,
      label: t('admin.users.detail.allProducts', { count: user.stats?.productsCount || 0 }),
    },
    {
      href: `/operations/trades?userId=${user.id}`,
      icon: ArrowPathIcon,
      label: t('admin.users.detail.allTrades', { count: user.stats?.tradesCount || 0 }),
    },
  ];

  return (
    <>
      <SectionCard title={t('admin.users.detail.quickActionsTitle')}>
        <div className="space-y-2">
          {quickLinks.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-muted transition-colors hover:bg-surface-alt"
              >
                <Icon className="h-5 w-5" />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={t('admin.users.detail.verificationStatusTitle')}>
        <div className="space-y-3">
          <VerifiedRow label={t('admin.users.detail.emailLabel')} ok={user.isEmailVerified} />
          <VerifiedRow label={t('common.phone')} ok={user.isPhoneVerified} />
          <VerifiedRow label={t('admin.users.detail.identityLabel')} ok={user.isVerified} />
          <VerifiedRow label={t('admin.users.seller')} ok={user.isSeller} />
        </div>
      </SectionCard>

      {user.addresses && user.addresses.length > 0 && (
        <SectionCard
          title={t('admin.users.detail.addressesTitle', { count: user.addresses.length })}
        >
          <div className="space-y-3">
            {user.addresses.map((address) => (
              <div key={address.id} className="rounded-lg bg-surface-alt p-3">
                <div className="mb-1 flex items-center gap-2">
                  <p className="font-medium text-heading">{address.title}</p>
                  {address.isDefault && (
                    <span className="rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                      {t('common.default')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{address.fullAddress}</p>
                <p className="text-sm text-muted">
                  {address.district}, {address.city}
                  {address.postalCode && ` - ${address.postalCode}`}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );
}
