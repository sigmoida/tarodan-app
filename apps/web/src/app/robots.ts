import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tarodan.com';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/dashboard/',
                    '/account/',
                    '/checkout/',
                    '/messages/',
                    '/my-listings/',
                    '/my-orders/',
                    '/my-offers/',
                    '/_next/',
                    '/static/',
                    '/payment/',
                ],
            },
            {
                userAgent: 'Googlebot',
                allow: '/',
                disallow: [
                    '/api/',
                    '/dashboard/',
                    '/account/',
                    '/checkout/',
                    '/messages/',
                    '/my-listings/',
                    '/my-orders/',
                    '/my-offers/',
                    '/payment/',
                ],
            },
            {
                userAgent: 'Bingbot',
                allow: '/',
                disallow: [
                    '/api/',
                    '/dashboard/',
                    '/account/',
                    '/checkout/',
                    '/messages/',
                    '/my-listings/',
                    '/my-orders/',
                    '/my-offers/',
                    '/payment/',
                ],
            },
        ],
        sitemap: `${BASE_URL}/sitemap.xml`,
        host: BASE_URL,
    };
}
