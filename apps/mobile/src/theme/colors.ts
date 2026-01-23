// Tarodan Theme Colors - Synced with Web Design
// Web globals.css: --primary: #f97316, --primary-dark: #ea580c
export const TarodanColors = {
  // Primary Colors (synced with web Tailwind orange-500/600)
  primary: '#f97316', // Main orange - matches web
  primaryDark: '#ea580c', // orange-600
  primaryLight: '#fb923c', // orange-400
  
  // Secondary Colors
  secondary: '#212121', // matches web --text-primary
  secondaryLight: '#757575', // matches web --text-secondary
  
  // Accent Colors (synced with web)
  accent: '#4CAF50', // Green - matches web --accent-green
  accentLight: '#81C784',
  accentBlue: '#2196F3', // matches web --accent-blue
  
  // Background Colors (synced with web)
  background: '#FAFAFA', // matches web --background
  backgroundSecondary: '#F5F5F5',
  surface: '#FFFFFF', // matches web --surface
  surfaceVariant: '#F5F5F5',
  
  // Text Colors (synced with web)
  textPrimary: '#212121', // matches web --text-primary
  textSecondary: '#757575', // matches web --text-secondary
  textLight: '#9E9E9E',
  textOnPrimary: '#FFFFFF',
  
  // Status Colors
  success: '#4CAF50', // synced with accent green
  warning: '#FFC107',
  error: '#F44336',
  info: '#2196F3', // synced with accent blue
  
  // Badge Colors
  badgeNew: '#4CAF50', // green
  badgeRare: '#9C27B0', // purple
  badgeDiscount: '#F44336', // red
  badgeTrade: '#2196F3', // blue
  
  // Border Colors (synced with web)
  border: '#E0E0E0', // matches web --border
  borderLight: '#EEEEEE',
  
  // Price Colors
  price: '#f97316', // orange like primary
  priceOld: '#9E9E9E',
  
  // Rating Colors
  star: '#FFC107', // amber
  starEmpty: '#E0E0E0',
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

// Brands matching web
export const BRANDS = [
  { id: 'hotwheels', name: 'Hot Wheels', logo: 'https://via.placeholder.com/80x40?text=HotWheels' },
  { id: 'matchbox', name: 'Matchbox', logo: 'https://via.placeholder.com/80x40?text=Matchbox' },
  { id: 'tamiya', name: 'Tamiya', logo: 'https://via.placeholder.com/80x40?text=Tamiya' },
  { id: 'autoart', name: 'AutoArt', logo: 'https://via.placeholder.com/80x40?text=AutoArt' },
  { id: 'kyosho', name: 'Kyosho', logo: 'https://via.placeholder.com/80x40?text=Kyosho' },
  { id: 'maisto', name: 'Maisto', logo: 'https://via.placeholder.com/80x40?text=Maisto' },
  { id: 'bbr', name: 'BBR', logo: 'https://via.placeholder.com/80x40?text=BBR' },
  { id: 'greenlight', name: 'Greenlight', logo: 'https://via.placeholder.com/80x40?text=Greenlight' },
];

// Condition options
export const CONDITIONS = [
  { id: 'new', name: 'Sıfır', color: '#00B894' },
  { id: 'like_new', name: 'Az Kullanılmış', color: '#00CEC9' },
  { id: 'good', name: 'İyi', color: '#0984E3' },
  { id: 'fair', name: 'Orta', color: '#FDCB6E' },
  { id: 'poor', name: 'Hasarlı', color: '#D63031' },
];
