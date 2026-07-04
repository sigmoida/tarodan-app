'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pageMetadataFor } from '@/lib/navigation';

/**
 * Keeps `document.title` and the `<meta name="description">` in sync with the
 * current route. Admin pages are all client components (they can't export the
 * App Router `metadata`), so the per-route title/description are derived from
 * the single nav config (`pageMetadataFor`) and applied here on navigation.
 */
export function RouteMetadata() {
  const pathname = usePathname();

  useEffect(() => {
    const { title, description } = pageMetadataFor(pathname);
    document.title = title;

    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [pathname]);

  return null;
}
