import type { MaterialOption } from './types';

// ---------------------------------------------------------------------------
// ListingForm — static option lists
// ---------------------------------------------------------------------------
export const CONDITIONS = [
  { value: 'new', label: 'Yeni' },
  { value: 'like_new', label: 'Sıfır Gibi' },
  { value: 'very_good', label: 'Mükemmel' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
];

export const FALLBACK_SCALES = ['1:18', '1:24', '1:43', '1:64', '1:87'];

export const FALLBACK_MATERIALS: MaterialOption[] = [
  { slug: 'diecast', label: 'Diecast (Metal)' },
  { slug: 'resin', label: 'Resin (Reçine)' },
  { slug: 'composite', label: 'Composite (Kompozit)' },
  { slug: 'plastic', label: 'Plastic (Plastik)' },
];

const currentYear = new Date().getFullYear();
export const YEAR_OPTIONS = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i);

// Kategori ağacında marka/ölçek slug'ları ayrı alanlara sahip; kategori
// listesinden dışlanır.
export const BRAND_SLUGS = ['hot-wheels', 'hot-wheels-premium', 'hot-wheels-rlc', 'matchbox', 'tomica', 'majorette', 'maisto', 'bburago', 'welly', 'jada', 'greenlight', 'auto-world', 'mini-gt', 'tarmac-works', 'inno64', 'pop-race'];
export const SCALE_SLUGS = ['scale-118', 'scale-124', 'scale-143', 'scale-164'];
