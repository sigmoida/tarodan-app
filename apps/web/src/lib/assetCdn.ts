/** @format */

/**
 * Statik pazarlama görsellerinin (hero) sunulduğu CDN/S3 kökü.
 * Görsellerin kendisi repo'da değil, S3'teki yönetilen `seed-assets/`
 * prefix'inde yaşar.
 * NEXT_PUBLIC_ASSET_CDN_URL build sırasında inline edilir; CloudFront gibi
 * bir CDN öne alınırsa tek değişecek yer burasıdır.
 */
const ASSET_CDN_BASE =
  process.env.NEXT_PUBLIC_ASSET_CDN_URL ??
  "https://amzn-tarodan.s3.eu-west-1.amazonaws.com";

export const seedAssetUrl = (path: string): string =>
  `${ASSET_CDN_BASE}/seed-assets/${path}`;

export const heroImageUrl = (file: string): string =>
  seedAssetUrl(`hero/${file}`);
