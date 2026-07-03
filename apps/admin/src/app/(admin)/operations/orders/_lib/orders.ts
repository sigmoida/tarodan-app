import { useMemo } from 'react';
import { orderStatusConfig } from '@tarodan/ui';
import { statusFilterOptions } from '@/lib/utils';

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commission: number;
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  product?: { id: string; title: string };
  createdAt: string;
  itemCount: number;
  cancelReason?: string;
  cancellationType?: string | null;
  activeRefundRequest?: { id: string; status: string; refundNumber?: string } | null;
  offerId?: string | null;
  checkoutGroupId?: string | null;
  groupNumber?: string | null;
  groupItemCount: number;
  productImageUrl?: string | null;
  // Sentetik grup-özet satırı alanları (gerçek sipariş değil; sepeti temsil eder).
  isGroupSummary?: boolean;
  groupTotalAmount?: number;
  groupCommission?: number;
  groupSellers?: { id: string; displayName: string }[];
  groupStatus?: 'ongoing' | 'done';
  groupThumbs?: string[];
}

/** Filtre seçenekleri orderStatusConfig'ten türetilir → badge'lerle birebir tutarlı. */
export const statusOptions = statusFilterOptions(orderStatusConfig);

export function mapOrders(raw: any[]): Order[] {
  return raw.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `ORD-${o.id.slice(0, 8)}`,
    status: o.status,
    totalAmount: Number(o.totalAmount || o.total || 0),
    commission: Number(o.commissionAmount || 0),
    buyer: o.buyer || { id: '', displayName: 'Alıcı' },
    seller: o.seller || { id: '', displayName: 'Satıcı' },
    product: o.product || undefined,
    createdAt: o.createdAt,
    itemCount: o.items?.length || 1,
    cancelReason: o.cancelReason ?? undefined,
    cancellationType: o.cancellationType ?? null,
    activeRefundRequest: o.activeRefundRequest ?? null,
    offerId: o.offerId ?? null,
    checkoutGroupId: o.checkoutGroupId ?? null,
    groupNumber: o.groupNumber ?? null,
    groupItemCount: Number(o.groupItemCount || 1),
    productImageUrl: o.productImageUrl ?? null,
  }));
}

/**
 * Çoklu-ürün checkout gruplarını SENTETİK bir "sepet özeti" satırına indirir.
 * Grup açıkken (expandedGroups) özetin altında üye siparişleri bandlı gösterilir;
 * tek-ürünlü siparişler aynen kalır.
 */
export function useOrderGroups(orders: Order[], expandedGroups: Set<string>) {
  return useMemo(() => {
    const rows: Order[] = [];
    const classMap = new Map<string, string>();
    const BAND = 'bg-primary-50/30 border-l-2 border-l-primary-300';
    const TERMINAL = ['completed', 'cancelled', 'refunded'];
    let i = 0;
    while (i < orders.length) {
      const o = orders[i];
      const gid = o.checkoutGroupId;
      if (gid && o.groupItemCount > 1) {
        const members: Order[] = [];
        let j = i;
        while (j < orders.length && orders[j].checkoutGroupId === gid) {
          members.push(orders[j]);
          j++;
        }
        const sellersMap = new Map<string, { id: string; displayName: string }>();
        for (const m of members) if (m.seller?.id) sellersMap.set(m.seller.id, m.seller);
        const thumbs: string[] = [];
        for (const m of members)
          if (thumbs.length < 4 && m.productImageUrl) thumbs.push(m.productImageUrl);
        const summary: Order = {
          ...o,
          id: `grp:${gid}`,
          isGroupSummary: true,
          checkoutGroupId: gid,
          groupTotalAmount: members.reduce((s, m) => s + (m.totalAmount || 0), 0),
          groupCommission: members.reduce((s, m) => s + (m.commission || 0), 0),
          groupSellers: Array.from(sellersMap.values()),
          groupStatus: members.every((m) => TERMINAL.includes(m.status)) ? 'done' : 'ongoing',
          groupThumbs: thumbs,
        };
        rows.push(summary);
        if (expandedGroups.has(gid)) {
          classMap.set(summary.id, BAND);
          for (const m of members) {
            rows.push(m);
            classMap.set(m.id, BAND);
          }
        }
        i = j;
      } else {
        rows.push(o);
        i++;
      }
    }
    return { displayRows: rows, rowClassById: classMap };
  }, [orders, expandedGroups]);
}
