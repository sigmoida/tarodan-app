import Link from 'next/link';
import { enumLabel, paymentStatusConfig, paymentProviderConfig } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataList, Field } from '@/components/detail/DataList';
import type { OrderDetail } from '../types';

export function PaymentSection({ payment }: { payment: NonNullable<OrderDetail['payment']> }) {
  return (
    <SectionCard title="Ödeme Bilgileri">
      <DataList columns={1}>
        <Field label="Durum">{enumLabel(paymentStatusConfig, payment.status)}</Field>
        <Field label="Tutar">
          ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </Field>
        <Field label="Sağlayıcı">{enumLabel(paymentProviderConfig, payment.provider)}</Field>
      </DataList>
      <Link
        href={`/payments/${payment.id}`}
        className="mt-3 block text-sm text-primary-600 hover:text-primary-700"
      >
        Ödeme Detayını Görüntüle →
      </Link>
    </SectionCard>
  );
}
