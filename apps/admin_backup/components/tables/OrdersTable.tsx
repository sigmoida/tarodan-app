'use client';

import Link from 'next/link';

interface Order {
  id: string;
  orderNumber: string;
  buyer: { displayName: string };
  seller: { displayName: string };
  total: number;
  status: string;
  createdAt: string;
}

interface OrdersTableProps {
  orders: Order[];
  onStatusChange?: (orderId: string, status: string) => void;
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  PAID: 'bg-blue-500/20 text-blue-400',
  SHIPPED: 'bg-purple-500/20 text-purple-400',
  DELIVERED: 'bg-green-500/20 text-green-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  REFUNDED: 'bg-gray-500/20 text-gray-400',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Bekliyor',
  PAID: 'Ödendi',
  SHIPPED: 'Kargoda',
  DELIVERED: 'Teslim Edildi',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
  REFUNDED: 'İade Edildi',
};

export function OrdersTable({ orders, onStatusChange }: OrdersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Sipariş No
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Alıcı
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Satıcı
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Tutar
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Durum
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Tarih
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              İşlem
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border hover:bg-muted/50">
              <td className="py-3 px-4 font-mono text-sm">{order.orderNumber}</td>
              <td className="py-3 px-4">{order.buyer.displayName}</td>
              <td className="py-3 px-4">{order.seller.displayName}</td>
              <td className="py-3 px-4 font-medium">
                {order.total.toLocaleString('tr-TR')} TL
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[order.status] || 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {statusLabels[order.status] || order.status}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString('tr-TR')}
              </td>
              <td className="py-3 px-4">
                <Link
                  href={`/orders/${order.id}`}
                  className="text-primary hover:underline text-sm"
                >
                  Detay
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default OrdersTable;
