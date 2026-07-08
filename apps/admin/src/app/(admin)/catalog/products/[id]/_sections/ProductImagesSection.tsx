import { PhotoIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import type { ProductDetail } from '../_lib/types';

export function ProductImagesSection({ product }: { product: ProductDetail }) {
  if (!product.images || product.images.length === 0) return null;
  return (
    <SectionCard title="Görseller" icon={PhotoIcon}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {product.images.map((image) => (
          <div key={image.id} className="aspect-square overflow-hidden rounded-lg bg-surface-alt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={product.title} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
