// Tarodan Theme Colors - Enhanced for Better UX
// Web globals.css: --primary: #f97316, --primary-dark: #ea580c
export const TarodanColors = {
  // Primary Colors (synced with web Tailwind orange-500/600)
  primary: '#f97316', // Main orange - matches web
  primaryDark: '#ea580c', // orange-600
  primaryLight: '#FFF7ED', // Very light orange for backgrounds
  primaryMedium: '#FFEDD5', // Light orange for cards/highlights
  
  // Secondary Colors
  secondary: '#1F2937', // Darker for better contrast
  secondaryLight: '#6B7280', // Better readable gray
  
  // Accent Colors (synced with web)
  accent: '#10B981', // Emerald green - more modern
  accentLight: '#D1FAE5',
  accentBlue: '#3B82F6', // Better blue
  accentBlueLite: '#DBEAFE',
  
  // Background Colors - Cleaner whites
  background: '#FFFFFF', // Pure white for main background
  backgroundSecondary: '#F9FAFB', // Very light gray
  backgroundTertiary: '#F3F4F6', // Slightly darker for sections
  surface: '#FFFFFF', // matches web --surface
  surfaceVariant: '#F9FAFB',
  
  // Text Colors - Better contrast
  textPrimary: '#111827', // Almost black for best readability
  textSecondary: '#4B5563', // Darker gray for secondary text
  textTertiary: '#9CA3AF', // Light gray for hints
  textLight: '#6B7280', // Medium gray
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FFFFFF',
  
  // Status Colors - More vibrant
  success: '#10B981', // Emerald
  successLight: '#D1FAE5',
  warning: '#F59E0B', // Amber
  warningLight: '#FEF3C7',
  error: '#EF4444', // Red
  errorLight: '#FEE2E2',
  info: '#3B82F6', // Blue
  infoLight: '#DBEAFE',
  
  // Badge Colors - More modern
  badgeNew: '#10B981', // green
  badgeRare: '#8B5CF6', // purple
  badgeDiscount: '#EF4444', // red
  badgeTrade: '#3B82F6', // blue
  badgePremium: '#F59E0B', // gold
  
  // Border Colors - Softer
  border: '#E5E7EB', // Softer gray
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',
  
  // Price Colors
  price: '#EA580C', // Darker orange for better readability
  priceOld: '#9CA3AF',
  priceSale: '#DC2626',
  
  // Rating Colors
  star: '#F59E0B', // amber
  starEmpty: '#E5E7EB',
  
  // Card shadows and overlays
  shadow: 'rgba(0, 0, 0, 0.1)',
  shadowDark: 'rgba(0, 0, 0, 0.15)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(255, 255, 255, 0.9)',
  
  // Gradient colors
  gradientStart: '#f97316',
  gradientEnd: '#F59E0B',
};

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

// Condition options
export const CONDITIONS = [
  { id: 'new', name: 'Sıfır', color: '#00B894' },
  { id: 'like_new', name: 'Az Kullanılmış', color: '#00CEC9' },
  { id: 'good', name: 'İyi', color: '#0984E3' },
  { id: 'fair', name: 'Orta', color: '#FDCB6E' },
  { id: 'poor', name: 'Hasarlı', color: '#D63031' },
];
