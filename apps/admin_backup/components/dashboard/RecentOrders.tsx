'use client';

import Link from 'next/link';

interface Order {
  id: string;
  orderNumber: string;
  buyer: { displayName: string };
  total: number;
  status: string;
  createdAt: string;
}

interface RecentOrdersProps {
  orders: Order[];
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  PAID: 'bg-blue-500/20 text-blue-400',
  SHIPPED: 'bg-purple-500/20 text-purple-400',
  DELIVERED: 'bg-green-500/20 text-green-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
};

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="bg-card rounded-lg border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">Son Siparişler</h3>
        <Link href="/orders" className="text-sm text-primary hover:underline">
          Tümünü Gör
        </Link>
      </div>
      <div className="divide-y divide-border">
        {orders.slice(0, 5).map((order) => (
          <div key={order.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">
                {order.buyer.displayName}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">
                {order.total.toLocaleString('tr-TR')} TL
              </p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  statusColors[order.status] || 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {order.status}
              </span>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            Henüz sipariş yok
          </div>
        )}
      </div>
    </div>
  );
}

export default RecentOrders;
