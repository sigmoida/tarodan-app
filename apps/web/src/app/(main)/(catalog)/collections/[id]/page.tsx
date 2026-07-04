import type { Metadata } from 'next';
import CollectionDetailClient from './CollectionDetailClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Props = { params: Promise<{ id: string }> };

interface CollectionForMeta {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
}

async function getCollection(id: string): Promise<CollectionForMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/api/collections/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || json;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection?.name) return { title: 'Koleksiyon Bulunamadı | Tarodan' };

  const title = `${collection.name} | Tarodan`;
  const description =
    collection.description?.slice(0, 160) || `${collection.name} koleksiyonunu Tarodan'da keşfedin`;
  const image = collection.coverImageUrl || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/collections/${id}`,
      images: image ? [{ url: image, alt: collection.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function CollectionPage() {
  return <CollectionDetailClient />;
}
