import { MetadataRoute } from 'next';

// Site base URL
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tarodan.com';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${BASE_URL}/listings`,
            lastModified: new Date(),
            changeFrequency: 'hourly',
            priority: 0.9,
        },
        {
            url: `${BASE_URL}/trades`,
            lastModified: new Date(),
            changeFrequency: 'hourly',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/login`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/register`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        // Category pages
        {
            url: `${BASE_URL}/listings?category=arabalar`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/listings?category=motosikletler`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/listings?category=motorsports`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/listings?category=ticari`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?category=ucaklar`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?category=gemiler`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?category=trenler`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        // Popular brand pages
        {
            url: `${BASE_URL}/listings?brand=Ferrari`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?brand=Porsche`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?brand=BMW`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?brand=Mercedes-Benz`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        // Popular scale pages
        {
            url: `${BASE_URL}/listings?scale=1:18`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?scale=1:24`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?scale=1:43`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?scale=1:64`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        // Popular manufacturer pages
        {
            url: `${BASE_URL}/listings?manufacturer=Hot%20Wheels`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?manufacturer=Matchbox`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?manufacturer=Minichamps`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/listings?manufacturer=AUTOart`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        // Legal pages
        {
            url: `${BASE_URL}/terms`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/cookies`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/distance-sales`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/how-it-works`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/contact`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.4,
        },
        {
            url: `${BASE_URL}/support`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.4,
        },
    ];

    // Dynamic static pages from API (about, faq, etc.)
    let cmsPages: MetadataRoute.Sitemap = [];
    try {
      const res = await fetch(`${API_BASE}/api/pages`, { next: { revalidate: 3600 } });
      if (res.ok) {
        const pages: Array<{ slug: string; updatedAt: string }> = await res.json();
        cmsPages = pages.map((p) => ({
          url: `${BASE_URL}/sayfa/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: 'monthly' as const,
          priority: 0.4,
        }));
      }
    } catch {
      // API unreachable; sitemap still returns static entries
    }

    return [...staticPages, ...cmsPages];
}
