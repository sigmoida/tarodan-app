'use client';

import Link from 'next/link';
import Image from 'next/image';

interface Product {
  id: string;
  title: string;
  price: number;
  status: string;
  seller: { displayName: string };
  category?: { name: string };
  images?: { url: string }[];
  createdAt: string;
}

interface ProductsTableProps {
  products: Product[];
  onApprove?: (productId: string) => void;
  onReject?: (productId: string) => void;
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  SOLD: 'bg-blue-500/20 text-blue-400',
  INACTIVE: 'bg-gray-500/20 text-gray-400',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  PENDING: 'Onay Bekliyor',
  REJECTED: 'Reddedildi',
  SOLD: 'Satıldı',
  INACTIVE: 'Pasif',
};

export function ProductsTable({ products, onApprove, onReject }: ProductsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Ürün
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Satıcı
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Kategori
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Fiyat
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
          {products.map((product) => (
            <tr key={product.id} className="border-b border-border hover:bg-muted/50">
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-muted rounded overflow-hidden">
                    {product.images?.[0] ? (
                      <Image
                        src={product.images[0].url}
                        alt={product.title}
                        width={48}
                        height={48}
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        No img
                      </div>
                    )}
                  </div>
                  <span className="font-medium truncate max-w-[200px]">
                    {product.title}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-sm">{product.seller.displayName}</td>
              <td className="py-3 px-4 text-sm">{product.category?.name || '-'}</td>
              <td className="py-3 px-4 font-medium">
                {product.price.toLocaleString('tr-TR')} TL
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[product.status] || 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {statusLabels[product.status] || product.status}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {new Date(product.createdAt).toLocaleDateString('tr-TR')}
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-2">
                  <Link
                    href={`/products/${product.id}`}
                    className="text-primary hover:underline text-sm"
                  >
                    Detay
                  </Link>
                  {product.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => onApprove?.(product.id)}
                        className="text-green-400 hover:underline text-sm"
                      >
                        Onayla
                      </button>
                      <button
                        onClick={() => onReject?.(product.id)}
                        className="text-red-400 hover:underline text-sm"
                      >
                        Reddet
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ProductsTable;
