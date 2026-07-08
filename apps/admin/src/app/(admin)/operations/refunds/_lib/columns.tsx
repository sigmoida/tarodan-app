import { col, type RowActionItem } from '@/components/table';

export interface Refund {
  id: string;
  amount: number;
  status: string;
  refundedAt: string;
  order: {
    id: string;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
  } | null;
}

export function refundColumns(rowMenu: (r: Refund) => RowActionItem[]) {
  return [
    col.code<Refund>('ID', (r) => r.id, { grow: 1 }),
    col.money<Refund>('Tutar', (r) => r.amount, { tone: 'negative' }),
    col.user<Refund>('Alıcı', (r) =>
      r.order?.buyer
        ? { name: r.order.buyer.displayName, href: `/accounts/users/${r.order.buyer.id}` }
        : null,
    ),
    col.user<Refund>('Satıcı', (r) =>
      r.order?.seller
        ? { name: r.order.seller.displayName, href: `/accounts/users/${r.order.seller.id}` }
        : null,
    ),
    col.text<Refund>('Ürün', (r) => r.order?.product?.title, { grow: 2 }),
    col.date<Refund>('İade Tarihi', (r) => r.refundedAt),
    col.rowMenu<Refund>(rowMenu),
  ];
}
