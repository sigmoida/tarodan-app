// Data constants for the mobile catalog (scales / brands / conditions).
// NOTE: the legacy `TarodanColors` hardcoded palette was removed — use
// `theme.colors` from `@tarodan/ui-native` (design tokens) for colors.
import { theme } from '@tarodan/ui-native';

// Scale/Size Options matching web
export const SCALES = [
  { id: '1:8', name: '1:8 Diecast' },
  { id: '1:12', name: '1:12 Diecast' },
  { id: '1:18', name: '1:18 Diecast' },
  { id: '1:24', name: '1:24 Diecast' },
  { id: '1:32', name: '1:32 Diecast' },
  { id: '1:36', name: '1:36 Diecast' },
  { id: '1:43', name: '1:43 Diecast' },
  { id: '1:64', name: '1:64 Diecast' },
];

/**
 * Ana sayfa marka şeridi — web `apps/web/src/app/page.tsx` BRANDS ile aynı (logoUrl = public path).
 * Arama filtre çipleri `id` + `name` kullanır.
 */
export const BRANDS = [
  { id: 'hotwheels', name: 'Hot Wheels', logoUrl: '/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg' },
  { id: 'matchbox', name: 'Matchbox', logoUrl: '/photos/logolar/images.png' },
  { id: 'tamiya', name: 'Tamiya', logoUrl: '/photos/logolar/tamiya-logo-png_seeklogo-324507.png' },
  { id: 'autoart', name: 'AUTOart', logoUrl: '/photos/logolar/download.png' },
  { id: 'kyosho', name: 'Kyosho', logoUrl: '/photos/logolar/Kyosho_corp_logo.png' },
  { id: 'maisto', name: 'Maisto', logoUrl: '/photos/logolar/maisto-logo.png' },
  { id: 'bburago', name: 'Bburago', logoUrl: '/photos/logolar/Bburago_Logo.png' },
  { id: 'greenlight', name: 'Greenlight', logoUrl: '/photos/logolar/Greenlight_collectibles_logo.png' },
  { id: 'minichamps', name: 'Minichamps', logoUrl: '/photos/logolar/minichamps_logo.png' },
  { id: 'minigt', name: 'MINI GT', logoUrl: '/photos/logolar/mini-gt-logo-png_seeklogo-523421.png' },
  { id: 'tomica', name: 'Tomica', logoUrl: '/photos/logolar/Tomica_brand_textlogo.png' },
  { id: 'majorette', name: 'Majorette', logoUrl: '/photos/logolar/majorette-logo-png_seeklogo-492958.png' },
  { id: 'gtspirit', name: 'GT Spirit', logoUrl: '/photos/logolar/GT-Spirit-Logo.webp' },
  { id: 'cmc', name: 'CMC', logoUrl: '/photos/logolar/cmc_logo-640x320.jpg' },
  { id: 'norev', name: 'Norev', logoUrl: '/photos/logolar/5bc0b46797d85-thumbnail.jpg' },
  { id: 'schuco', name: 'Schuco', logoUrl: '/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg' },
];

// Condition options — renkler design token'larına bağlı (#82; eski hex palet kaldırıldı).
// new/like_new = success (iyi durum), good = info, fair = warning, poor = danger.
export const CONDITIONS = [
  { id: 'new', name: 'Sıfır', color: theme.colors.success[500] },
  { id: 'like_new', name: 'Az Kullanılmış', color: theme.colors.success[500] },
  { id: 'good', name: 'İyi', color: theme.colors.info[500] },
  { id: 'fair', name: 'Orta', color: theme.colors.warning[500] },
  { id: 'poor', name: 'Hasarlı', color: theme.colors.danger[500] },
];
