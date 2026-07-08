import Link from 'next/link';
import { SectionCard } from '@/components/detail/SectionCard';
import type { ProductDetail } from '../_lib/types';

export function ProductSellerSection({ seller }: { seller: ProductDetail['seller'] }) {
  return (
    <SectionCard title="Satıcı Bilgileri" bodyClassName="space-y-2">
      <p>
        <span className="text-muted">İsim:</span>{' '}
        <Link href={`/accounts/users/${seller.id}`} className="font-medium text-primary-600 hover:underline">
          {seller.displayName}
        </Link>
      </p>
      <p>
        <span className="text-muted">Email:</span> {seller.email}
      </p>
    </SectionCard>
  );
}
