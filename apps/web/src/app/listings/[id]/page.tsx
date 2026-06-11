import type { Metadata } from 'next';
import ListingDetailClient from './ListingDetailClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Props = { params: Promise<{ id: string }> };

interface ProductForMeta {
  title?: string;
  description?: string | null;
  price?: number | string | null;
  images?: Array<{ detailUrl?: string; cardUrl?: string; url?: string }>;
}

async function getProduct(id: string): Promise<ProductForMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product?.title) return { title: 'İlan Bulunamadı | Tarodan' };

  const priceNum = Number(product.price);
  const priceText = Number.isFinite(priceNum) ? ` - ₺${priceNum.toLocaleString('tr-TR')}` : '';
  const title = `${product.title}${priceText} | Tarodan`;
  const description =
    product.description?.slice(0, 160) || `${product.title} Tarodan'da satışta`;
  const firstImage = product.images?.[0];
  const image = firstImage?.detailUrl || firstImage?.cardUrl || firstImage?.url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/listings/${id}`,
      images: image ? [{ url: image, alt: product.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function ListingPage() {
  return <ListingDetailClient />;
}
