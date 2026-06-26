import { 
  PrismaClient, 
  AdminRole, 
  CommissionRuleType, 
  SellerType,
  CommissionSellerType,
  MembershipTierType,
  ProductStatus,
  ProductCondition,
  TradeStatus,
  SubscriptionStatus,
  OfferStatus,
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  RefundReason,
  RefundRequestStatus,
  ReturnShippingPayer,
  MessageStatus,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  RatingStatus
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../src/modules/storage/storage.service';
import { PrismaService } from '../src/prisma';
const prisma = new PrismaClient();

// Initialize StorageService for seed script
function initStorageService(): StorageService | null {
  try {
    // Create mock ConfigService that reads from process.env
    const configService = {
      get: (key: string, defaultValue?: any) => {
        return process.env[key] || defaultValue;
      },
    } as any;

    // Create PrismaService instance
    const prismaService = new PrismaService();

    // Create StorageService instance
    const storageService = new StorageService(configService, prismaService);
    
    return storageService;
  } catch (error: any) {
    console.error('⚠️ Failed to initialize StorageService:', error.message);
    return null;
  }
}

// Helper to generate random price
const randomPrice = (min: number, max: number) => 
  Math.round((Math.random() * (max - min) + min) * 100) / 100;

// Helper to generate order number (matches the runtime ORD-XXXXXXXXXX format;
// non-ambiguous alphabet, dev/seed data only)
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const generateOrderNumber = () =>
  `ORD-${Array.from({ length: 10 }, () => REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]).join('')}`;

// Helper to generate trade number
const generateTradeNumber = () => 
  `TRD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// Helper to generate ticket number
const generateTicketNumber = () => 
  `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// Helper for random date in past
const randomPastDate = (daysBack: number) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date;
};

// Helper for random future date
const randomFutureDate = (daysAhead: number) => {
  const date = new Date();
  date.setDate(date.getDate() + Math.floor(Math.random() * daysAhead) + 1);
  return date;
};

// ==========================================================================
// Photo Upload Helpers
// ==========================================================================

const getMimeType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
};

let sharp: any;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const CACHE_OPTS = {
  contentType: 'image/webp' as const,
  cacheControl: 'public, max-age=31536000, immutable',
  skipMediaFile: true,
};

/** Upload product image as card + detail variants. Throws on failure. */
async function uploadProductImageVariants(
  storageService: StorageService,
  filepath: string,
  productId: string,
): Promise<{ cardKey: string; detailKey: string }> {
  if (!sharp) throw new Error('sharp not installed - run npm install sharp');
  const buffer = fs.readFileSync(filepath);
  const baseId = randomUUID();
  const folder = `product-images/${productId}`;

  const cardBuffer = await sharp(buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  const detailBuffer = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside' })
    .webp({ quality: 90 })
    .toBuffer();

  const cardResult = await storageService.uploadFile(cardBuffer, {
    bucket: 'products',
    folder,
    filename: `${baseId}-card.webp`,
    mimeType: 'image/webp',
    ...CACHE_OPTS,
  });

  const detailResult = await storageService.uploadFile(detailBuffer, {
    bucket: 'products',
    folder,
    filename: `${baseId}-detail.webp`,
    mimeType: 'image/webp',
    ...CACHE_OPTS,
  });

  return { cardKey: cardResult.key, detailKey: detailResult.key };
}

/** Upload collection cover. Throws on failure. */
async function uploadCollectionCover(
  storageService: StorageService,
  filepath: string,
): Promise<string> {
  if (!sharp) throw new Error('sharp not installed - run npm install sharp');
  const buffer = fs.readFileSync(filepath);
  const webpBuffer = await sharp(buffer)
    .resize(1200, 600, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  const result = await storageService.uploadFile(webpBuffer, {
    bucket: 'collections',
    folder: 'covers',
    filename: `${randomUUID()}.webp`,
    mimeType: 'image/webp',
    ...CACHE_OPTS,
  });
  return result.key;
}

// Support both monorepo (cwd=apps/api → ../../photos) and Docker (cwd=/app → ./photos)
const monorepoPhotos = path.join(process.cwd(), '..', '..', 'photos');
const dockerPhotos = path.join(process.cwd(), 'photos');
const PHOTOS_ROOT = fs.existsSync(monorepoPhotos) ? monorepoPhotos : dockerPhotos;
const WEB_PUBLIC_PHOTOS = path.join(process.cwd(), '..', 'web', 'public', 'photos');

/** photos/ klasörünü apps/web/public/photos/ altına kopyalar. Başka bilgisayarda çekildiğinde görseller çalışır. */
function copyPhotosToPublic() {
  if (!fs.existsSync(PHOTOS_ROOT)) {
    console.log('⚠️ photos/ klasörü bulunamadı, placeholder kullanılacak.');
    return;
  }
  try {
    const destDir = path.dirname(WEB_PUBLIC_PHOTOS);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(PHOTOS_ROOT, WEB_PUBLIC_PHOTOS, { recursive: true });
    console.log('✅ photos/ → apps/web/public/photos/ kopyalandı');
  } catch (err: any) {
    console.warn(`⚠️ photos web/public'e kopyalanamadı: ${err.message} — Docker ortamında bu normaldir.`);
  }
}

async function main() {
  console.log('🌱 Starting COMPREHENSIVE database seed...');
  console.log('📦 This will create a large dataset for testing ALL features\n');

  copyPhotosToPublic();

  // ==========================================================================
  // 1. Create Categories - Sadece araç türü (üst seviye)
  // ==========================================================================
  console.log('Creating categories (vehicle types only)...');

  const categoryData = [
    { name: 'Araba', slug: 'araba', description: 'Binek ve spor arabalar', sortOrder: 1 },
    { name: 'Motosiklet', slug: 'motosiklet', description: 'Motosiklet modelleri', sortOrder: 2 },
    { name: 'Uçak', slug: 'ucak', description: 'Uçak ve helikopter modelleri', sortOrder: 3 },
    { name: 'Gemi', slug: 'gemi', description: 'Gemi ve tekne modelleri', sortOrder: 4 },
    { name: 'Tren', slug: 'tren', description: 'Tren ve lokomotif modelleri', sortOrder: 5 },
    { name: 'Kamyon / İş Makinesi', slug: 'kamyon', description: 'Kamyon, SUV, iş makinesi', sortOrder: 6 },
    { name: 'Motorspor', slug: 'motorspor', description: 'Yarış, F1, motorspor', sortOrder: 7 },
    { name: 'Set / Diğer', slug: 'set-diger', description: 'Setler ve diğer modeller', sortOrder: 8 },
  ];

  const categories = await Promise.all(
    categoryData.map((cat) =>
      prisma.category.upsert({
        where: { slug: cat.slug },
        update: { name: cat.name, description: cat.description ?? undefined, sortOrder: cat.sortOrder, parentId: null },
        create: { ...cat, parentId: null },
      })
    )
  );

  // Clean up old categories that are no longer needed
  const newSlugs = categoryData.map((c) => c.slug);
  await prisma.category.deleteMany({ where: { slug: { notIn: newSlugs } } });

  console.log(`✅ Created ${categories.length} categories (vehicle types only)`);

  // ==========================================================================
  // 1b. Create Manufacturers (diecast brands: Hot Wheels, Tomica, etc.)
  // Logo paths point to apps/web/public/photos/logolar/.
  // Logos are only set on CREATE, not UPDATE, so re-running seed
  // does not overwrite admin-uploaded S3 logos.
  // ==========================================================================
  console.log('Creating manufacturers...');

  const manufacturerData = [
    { name: 'Hot Wheels', slug: 'hot-wheels', country: 'ABD', description: 'Mattel tarafından üretilen diecast model araba markası', logo: '/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg' },
    { name: 'Matchbox', slug: 'matchbox', country: 'İngiltere', description: 'Lesney Products tarafından başlatılan diecast model markası', logo: '/photos/logolar/images.png' },
    { name: 'Majorette', slug: 'majorette', country: 'Fransa', description: 'Fransız diecast model araba üreticisi', logo: '/photos/logolar/majorette-logo-png_seeklogo-492958.png' },
    { name: 'Tomica', slug: 'tomica', country: 'Japonya', description: 'Takara Tomy tarafından üretilen Japon diecast model markası', logo: '/photos/logolar/Tomica_brand_textlogo.png' },
    { name: 'Bburago', slug: 'bburago', country: 'İtalya', description: 'İtalyan diecast model araba üreticisi', logo: '/photos/logolar/Bburago_Logo.png' },
    { name: 'Maisto', slug: 'maisto', country: 'ABD', description: 'Amerikan diecast model araba üreticisi', logo: '/photos/logolar/maisto-logo.png' },
    { name: 'AUTOart', slug: 'autoart', country: 'Hong Kong', description: 'Yüksek kaliteli koleksiyon diecast model üreticisi', logo: '/photos/logolar/download.png' },
    { name: 'Minichamps', slug: 'minichamps', country: 'Almanya', description: 'Alman model araba üreticisi, özellikle F1 modelleri', logo: '/photos/logolar/minichamps_logo.png' },
    { name: 'Kyosho', slug: 'kyosho', country: 'Japonya', description: 'Japon model araba ve RC araç üreticisi', logo: '/photos/logolar/Kyosho_corp_logo.png' },
    { name: 'CMC', slug: 'cmc', country: 'Almanya', description: 'Premium koleksiyon modelleri üreticisi', logo: '/photos/logolar/cmc_logo-640x320.jpg' },
    { name: 'GT Spirit', slug: 'gt-spirit', country: 'Fransa', description: 'Resin model araba üreticisi', logo: '/photos/logolar/GT-Spirit-Logo.webp' },
    { name: 'Almost Real', slug: 'almost-real', country: 'Çin', description: 'Yüksek detaylı diecast model üreticisi', logo: null },
    { name: 'Spark', slug: 'spark', country: 'Çin', description: 'Resin model araba üreticisi, yarış modelleri', logo: null },
    { name: 'Schuco', slug: 'schuco', country: 'Almanya', description: 'Alman model araba üreticisi', logo: '/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg' },
    { name: 'Norev', slug: 'norev', country: 'Fransa', description: 'Fransız diecast model üreticisi', logo: '/photos/logolar/5bc0b46797d85-thumbnail.jpg' },
    { name: 'Oxford Diecast', slug: 'oxford-diecast', country: 'İngiltere', description: 'İngiliz diecast model üreticisi', logo: null },
    { name: 'Greenlight', slug: 'greenlight', country: 'ABD', description: 'Amerikan diecast model üreticisi', logo: '/photos/logolar/Greenlight_collectibles_logo.png' },
    { name: 'ERTL', slug: 'ertl', country: 'ABD', description: 'Amerikan diecast model üreticisi', logo: null },
    { name: 'Tamiya', slug: 'tamiya', country: 'Japonya', description: 'Japon model kit ve diecast üreticisi', logo: '/photos/logolar/tamiya-logo-png_seeklogo-324507.png' },
    { name: 'Welly', slug: 'welly', country: 'Hong Kong', description: 'Diecast model araba üreticisi', logo: null },
    { name: 'MINI GT', slug: 'mini-gt', country: 'Hong Kong', description: 'TSM tarafından üretilen 1:64 ölçek diecast model markası', logo: '/photos/logolar/mini-gt-logo-png_seeklogo-523421.png' },
  ];

  const manufacturers: any[] = [];
  for (let i = 0; i < manufacturerData.length; i++) {
    const m = manufacturerData[i];
    const existing = await prisma.manufacturer.findUnique({ where: { slug: m.slug }, select: { logo: true } });
    // Use repo logo when: no existing logo, or existing is S3 URL (so deployment/clone gets consistent logos from repo)
    const isRepoPath = (v: string | null) => v != null && (v.startsWith('/photos/logolar') || v.startsWith('/'));
    const useSeedLogo = m.logo != null && (!existing?.logo || (existing.logo && !isRepoPath(existing.logo)));
    const result = await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      update: {
        name: m.name, country: m.country, description: m.description,
        ...(useSeedLogo ? { logo: m.logo } : {}),
      },
      create: { name: m.name, slug: m.slug, country: m.country, description: m.description, logo: m.logo, sortOrder: i + 1 },
    });
    manufacturers.push(result);
  }

  console.log(`✅ Created ${manufacturers.length} manufacturers`);

  // ==========================================================================
  // 1c. Create Brands (vehicle brands – NOT diecast manufacturers)
  // ==========================================================================
  console.log('Creating vehicle brands...');

  const brandData = [
    { name: 'Ferrari', slug: 'ferrari', country: 'İtalya', foundedYear: 1939 },
    { name: 'Aston Martin', slug: 'aston-martin', country: 'İngiltere', foundedYear: 1913 },
    { name: 'Mercedes-Benz', slug: 'mercedes-benz', country: 'Almanya', foundedYear: 1926 },
    { name: 'Porsche', slug: 'porsche', country: 'Almanya', foundedYear: 1931 },
    { name: 'Chevrolet', slug: 'chevrolet', country: 'ABD', foundedYear: 1911 },
    { name: 'Alfa Romeo', slug: 'alfa-romeo', country: 'İtalya', foundedYear: 1910 },
    { name: 'Ford', slug: 'ford', country: 'ABD', foundedYear: 1903 },
    { name: 'Volkswagen', slug: 'volkswagen', country: 'Almanya', foundedYear: 1937 },
    { name: 'Toyota', slug: 'toyota', country: 'Japonya', foundedYear: 1937 },
    { name: 'Nissan', slug: 'nissan', country: 'Japonya', foundedYear: 1933 },
    { name: 'Lamborghini', slug: 'lamborghini', country: 'İtalya', foundedYear: 1963 },
    { name: 'McLaren', slug: 'mclaren', country: 'İngiltere', foundedYear: 1963 },
    { name: 'Honda', slug: 'honda', country: 'Japonya', foundedYear: 1948 },
    { name: 'BMW', slug: 'bmw', country: 'Almanya', foundedYear: 1916 },
    { name: 'Dodge', slug: 'dodge', country: 'ABD', foundedYear: 1900 },
    { name: 'Pontiac', slug: 'pontiac', country: 'ABD', foundedYear: 1926 },
    { name: 'Plymouth', slug: 'plymouth', country: 'ABD', foundedYear: 1928 },
    { name: 'Jeep', slug: 'jeep', country: 'ABD', foundedYear: 1941 },
    { name: 'Land Rover', slug: 'land-rover', country: 'İngiltere', foundedYear: 1948 },
    { name: 'Mazda', slug: 'mazda', country: 'Japonya', foundedYear: 1920 },
    { name: 'Ducati', slug: 'ducati', country: 'İtalya', foundedYear: 1926 },
    { name: 'Harley-Davidson', slug: 'harley-davidson', country: 'ABD', foundedYear: 1903 },
    { name: 'Kawasaki', slug: 'kawasaki', country: 'Japonya', foundedYear: 1896 },
  ];

  const brands = await Promise.all(
    brandData.map((b, i) =>
      prisma.brand.upsert({
        where: { slug: b.slug },
        update: { name: b.name, country: b.country, foundedYear: b.foundedYear },
        create: { ...b, sortOrder: i + 1, isActive: true },
      })
    )
  );

  console.log(`✅ Created ${brands.length} vehicle brands`);

  // ==========================================================================
  // 1d. Create Car Models (linked to brands)
  // ==========================================================================
  console.log('Creating car models...');

  const carModelData = [
    { brandSlug: 'ferrari', name: '275 GTB', slug: 'ferrari-275-gtb', yearStart: 1964, yearEnd: 1968 },
    { brandSlug: 'ferrari', name: 'F8 Tributo', slug: 'ferrari-f8-tributo', yearStart: 2019, yearEnd: 2024 },
    { brandSlug: 'aston-martin', name: 'DB5', slug: 'aston-martin-db5', yearStart: 1963, yearEnd: 1965 },
    { brandSlug: 'mercedes-benz', name: '300SL Gullwing', slug: 'mercedes-300sl-gullwing', yearStart: 1954, yearEnd: 1957 },
    { brandSlug: 'mercedes-benz', name: 'G-Class G63 AMG', slug: 'mercedes-g-class', yearStart: 2018, yearEnd: null },
    { brandSlug: 'porsche', name: '356 Speedster', slug: 'porsche-356', yearStart: 1948, yearEnd: 1965 },
    { brandSlug: 'porsche', name: '911 GT3 RS', slug: 'porsche-911-gt3-rs', yearStart: 2022, yearEnd: null },
    { brandSlug: 'porsche', name: '911 Turbo', slug: 'porsche-911-turbo', yearStart: 1975, yearEnd: null },
    { brandSlug: 'porsche', name: '917K', slug: 'porsche-917k', yearStart: 1969, yearEnd: 1971 },
    { brandSlug: 'chevrolet', name: 'Corvette Stingray C2', slug: 'chevrolet-corvette-c2', yearStart: 1963, yearEnd: 1967 },
    { brandSlug: 'chevrolet', name: 'Corvette C8', slug: 'chevrolet-corvette-c8', yearStart: 2020, yearEnd: null },
    { brandSlug: 'chevrolet', name: 'Camaro SS', slug: 'chevrolet-camaro-ss', yearStart: 1967, yearEnd: 1969 },
    { brandSlug: 'chevrolet', name: 'Chevelle SS', slug: 'chevrolet-chevelle-ss', yearStart: 1966, yearEnd: 1973 },
    { brandSlug: 'chevrolet', name: 'Silverado', slug: 'chevrolet-silverado', yearStart: 1999, yearEnd: null },
    { brandSlug: 'chevrolet', name: 'Impala', slug: 'chevrolet-impala', yearStart: 1958, yearEnd: 2020 },
    { brandSlug: 'alfa-romeo', name: 'Giulia Sprint GTA', slug: 'alfa-romeo-giulia-gta', yearStart: 1965, yearEnd: 1969 },
    { brandSlug: 'ford', name: 'Thunderbird', slug: 'ford-thunderbird', yearStart: 1955, yearEnd: 1997 },
    { brandSlug: 'ford', name: 'Mustang Mach 1', slug: 'ford-mustang-mach-1', yearStart: 1969, yearEnd: 1978 },
    { brandSlug: 'ford', name: 'Mustang Boss 429', slug: 'ford-mustang-boss-429', yearStart: 1969, yearEnd: 1970 },
    { brandSlug: 'ford', name: 'Mustang Shelby GT500', slug: 'ford-mustang-gt500', yearStart: 1967, yearEnd: 1970 },
    { brandSlug: 'ford', name: 'F-150 Raptor', slug: 'ford-f150-raptor', yearStart: 2010, yearEnd: null },
    { brandSlug: 'volkswagen', name: 'Beetle', slug: 'volkswagen-beetle', yearStart: 1938, yearEnd: 2003 },
    { brandSlug: 'toyota', name: '2000GT', slug: 'toyota-2000gt', yearStart: 1967, yearEnd: 1970 },
    { brandSlug: 'toyota', name: 'Supra MK4', slug: 'toyota-supra-mk4', yearStart: 1993, yearEnd: 2002 },
    { brandSlug: 'toyota', name: 'Land Cruiser J70', slug: 'toyota-land-cruiser-j70', yearStart: 1984, yearEnd: null },
    { brandSlug: 'toyota', name: 'Hilux', slug: 'toyota-hilux', yearStart: 1968, yearEnd: null },
    { brandSlug: 'toyota', name: 'AE86 Sprinter Trueno', slug: 'toyota-ae86', yearStart: 1983, yearEnd: 1987 },
    { brandSlug: 'nissan', name: 'Skyline GT-R R34', slug: 'nissan-skyline-gtr-r34', yearStart: 1999, yearEnd: 2002 },
    { brandSlug: 'nissan', name: 'GT-R R35', slug: 'nissan-gtr-r35', yearStart: 2007, yearEnd: null },
    { brandSlug: 'lamborghini', name: 'Aventador', slug: 'lamborghini-aventador', yearStart: 2011, yearEnd: 2022 },
    { brandSlug: 'lamborghini', name: 'Huracan', slug: 'lamborghini-huracan', yearStart: 2014, yearEnd: null },
    { brandSlug: 'mclaren', name: 'P1', slug: 'mclaren-p1', yearStart: 2013, yearEnd: 2015 },
    { brandSlug: 'honda', name: 'NSX Type-R', slug: 'honda-nsx-type-r', yearStart: 1992, yearEnd: 2005 },
    { brandSlug: 'honda', name: 'CBR1000RR Fireblade', slug: 'honda-cbr1000rr', yearStart: 2004, yearEnd: null },
    { brandSlug: 'honda', name: 'Civic', slug: 'honda-civic', yearStart: 1972, yearEnd: null },
    { brandSlug: 'bmw', name: 'M4', slug: 'bmw-m4', yearStart: 2014, yearEnd: null },
    { brandSlug: 'bmw', name: 'R1250GS Adventure', slug: 'bmw-r1250gs', yearStart: 2019, yearEnd: null },
    { brandSlug: 'dodge', name: 'Challenger R/T', slug: 'dodge-challenger-rt', yearStart: 1970, yearEnd: 1974 },
    { brandSlug: 'dodge', name: 'Charger', slug: 'dodge-charger', yearStart: 1966, yearEnd: null },
    { brandSlug: 'pontiac', name: 'GTO Judge', slug: 'pontiac-gto-judge', yearStart: 1969, yearEnd: 1971 },
    { brandSlug: 'plymouth', name: 'Barracuda', slug: 'plymouth-barracuda', yearStart: 1964, yearEnd: 1974 },
    { brandSlug: 'jeep', name: 'Wrangler Rubicon', slug: 'jeep-wrangler-rubicon', yearStart: 2003, yearEnd: null },
    { brandSlug: 'land-rover', name: 'Defender 90', slug: 'land-rover-defender', yearStart: 1983, yearEnd: null },
    { brandSlug: 'mazda', name: 'RX-7 FD', slug: 'mazda-rx-7', yearStart: 1991, yearEnd: 2002 },
    { brandSlug: 'ducati', name: 'Panigale V4', slug: 'ducati-panigale-v4', yearStart: 2018, yearEnd: null },
    { brandSlug: 'harley-davidson', name: 'Fat Boy', slug: 'harley-fat-boy', yearStart: 1990, yearEnd: null },
    { brandSlug: 'kawasaki', name: 'Ninja ZX-10R', slug: 'kawasaki-ninja-zx10r', yearStart: 2004, yearEnd: null },
  ];

  const carModels = await Promise.all(
    carModelData.map((cm, i) => {
      const brand = brands.find(b => b.slug === cm.brandSlug)!;
      return prisma.carModel.upsert({
        where: { slug: cm.slug },
        update: { name: cm.name, yearStart: cm.yearStart, yearEnd: cm.yearEnd },
        create: { brandId: brand.id, name: cm.name, slug: cm.slug, yearStart: cm.yearStart, yearEnd: cm.yearEnd, sortOrder: i + 1, isActive: true },
      });
    })
  );

  console.log(`✅ Created ${carModels.length} car models`);

  // ==========================================================================
  // 1e. Create Attribute Groups & Attributes (scale, material)
  // ==========================================================================
  console.log('Creating attribute groups...');

  const scaleGroup = await prisma.attributeGroup.upsert({
    where: { slug: 'scale' },
    update: {},
    create: { name: 'Ölçek', slug: 'scale', isRequired: false, sortOrder: 1 },
  });

  const materialGroup = await prisma.attributeGroup.upsert({
    where: { slug: 'material' },
    update: {},
    create: { name: 'Malzeme', slug: 'material', isRequired: false, sortOrder: 2 },
  });

  const vehicleTypeGroup = await prisma.attributeGroup.upsert({
    where: { slug: 'vehicle_type' },
    update: {},
    create: { name: 'Araç Türü', slug: 'vehicle_type', description: 'Ürünün temsil ettiği araç kategorisi', isRequired: false, sortOrder: 3 },
  });

  const scaleValues = ['1:18', '1:24', '1:43', '1:64', '1:72', '1:160', '1:350', '1:400', '1:700'];
  const materialValues = [
    { value: 'diecast', display: 'Diecast Metal' },
    { value: 'resin', display: 'Resin' },
    { value: 'plastic', display: 'Plastik' },
    { value: 'composite', display: 'Karışık (Metal+Plastik)' },
  ];

  const scaleAttrs: Record<string, any> = {};
  for (const sv of scaleValues) {
    const slug = sv.replace(':', '-');
    scaleAttrs[sv] = await prisma.attribute.upsert({
      where: { groupId_slug: { groupId: scaleGroup.id, slug } },
      update: {},
      create: { groupId: scaleGroup.id, value: sv, slug, displayValue: sv, sortOrder: scaleValues.indexOf(sv) },
    });
  }

  const materialAttrs: Record<string, any> = {};
  for (const mv of materialValues) {
    materialAttrs[mv.value] = await prisma.attribute.upsert({
      where: { groupId_slug: { groupId: materialGroup.id, slug: mv.value } },
      update: {},
      create: { groupId: materialGroup.id, value: mv.value, slug: mv.value, displayValue: mv.display, sortOrder: materialValues.indexOf(mv) },
    });
  }

  const vehicleTypeValues = [
    { value: 'car', display: 'Araba' },
    { value: 'motorcycle', display: 'Motosiklet' },
    { value: 'motorsports', display: 'Motorsports' },
    { value: 'truck', display: 'Ticari Araç' },
    { value: 'emergency', display: 'Acil Durum Aracı' },
    { value: 'construction', display: 'İnşaat Aracı' },
    { value: 'agriculture', display: 'Tarım Aracı' },
    { value: 'military', display: 'Askeri Araç' },
    { value: 'ship', display: 'Gemi / Tekne' },
    { value: 'train', display: 'Tren' },
    { value: 'aircraft', display: 'Uçak / Helikopter' },
    { value: 'bus', display: 'Otobüs / Minibüs' },
  ];

  const vehicleTypeAttrs: Record<string, any> = {};
  for (const vt of vehicleTypeValues) {
    vehicleTypeAttrs[vt.value] = await prisma.attribute.upsert({
      where: { groupId_slug: { groupId: vehicleTypeGroup.id, slug: vt.value } },
      update: {},
      create: { groupId: vehicleTypeGroup.id, value: vt.value, slug: vt.value, displayValue: vt.display, sortOrder: vehicleTypeValues.indexOf(vt) },
    });
  }

  console.log(`✅ Created attribute groups (${scaleValues.length} scales, ${materialValues.length} materials, ${vehicleTypeValues.length} vehicle types)`);

  console.log('Seeding Hot Wheels-specific attribute groups...');
  const { seedHotWheelsAttributes } = await import('./seed-hw-attributes');
  await seedHotWheelsAttributes(prisma);

  // Map seed category slug (cat) -> vehicle_type attribute slug for product attributes
  const catToVehicleTypeSlug: Record<string, string> = {
    araba: 'car',
    kamyon: 'truck',
    motosiklet: 'motorcycle',
    motorspor: 'motorsports',
    gemi: 'ship',
    tren: 'train',
    ucak: 'aircraft',
    otobus: 'bus',
    acil: 'emergency',
    insaat: 'construction',
    tarim: 'agriculture',
    askeri: 'military',
  };

  // ==========================================================================
  // 2. Create Membership Tiers
  // ==========================================================================
  console.log('Creating membership tiers...');

  const membershipTiers = await Promise.all([
    prisma.membershipTier.upsert({
      where: { type: MembershipTierType.free },
      update: {},
      create: {
        type: MembershipTierType.free,
        name: 'Ücretsiz Üyelik',
        description: 'Temel özelliklerle başlayın',
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxFreeListings: 5,
        maxTotalListings: 10,
        maxImagesPerListing: 3,
        canCreateCollections: false,
        canTrade: false,
        isAdFree: false,
        featuredListingSlots: 0,
        commissionDiscount: 0,
        sortOrder: 0,
      },
    }),
    prisma.membershipTier.upsert({
      where: { type: MembershipTierType.basic },
      update: {},
      create: {
        type: MembershipTierType.basic,
        name: 'Temel Üyelik',
        description: 'Daha fazla ilan ve takas özelliği',
        monthlyPrice: 49.99,
        yearlyPrice: 479.99,
        maxFreeListings: 15,
        maxTotalListings: 50,
        maxImagesPerListing: 6,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: false,
        featuredListingSlots: 2,
        commissionDiscount: 0.005,
        sortOrder: 1,
      },
    }),
    prisma.membershipTier.upsert({
      where: { type: MembershipTierType.premium },
      update: {},
      create: {
        type: MembershipTierType.premium,
        name: 'Premium Üyelik',
        description: 'Profesyonel koleksiyoncular için',
        monthlyPrice: 99.99,
        yearlyPrice: 959.99,
        maxFreeListings: 50,
        maxTotalListings: 200,
        maxImagesPerListing: 10,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 10,
        commissionDiscount: 0.01,
        sortOrder: 2,
      },
    }),
    prisma.membershipTier.upsert({
      where: { type: MembershipTierType.business },
      update: {},
      create: {
        type: MembershipTierType.business,
        name: 'İş Üyeliği',
        description: 'Kurumsal satıcılar için',
        monthlyPrice: 249.99,
        yearlyPrice: 2399.99,
        maxFreeListings: 200,
        maxTotalListings: 1000,
        maxImagesPerListing: 15,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 50,
        commissionDiscount: 0.015,
        sortOrder: 3,
      },
    }),
  ]);

  console.log(`✅ Created ${membershipTiers.length} membership tiers`);

  // ==========================================================================
  // 3. Create Commission Rules
  // ==========================================================================
  console.log('Creating commission rules...');

  const commissionRules = await Promise.all([
    prisma.commissionRule.upsert({
      where: { id: 'default-rule' },
      update: {},
      create: {
        id: 'default-rule',
        name: 'Varsayılan Komisyon',
        ruleType: CommissionRuleType.default,
        sellerType: CommissionSellerType.ALL,
        appliesTo: 'SELLER',
        sellerRate: 5.0,
        percentage: 0.05,
        priority: 0,
        isActive: true,
      },
    }),
    prisma.commissionRule.upsert({
      where: { id: 'vintage-rule' },
      update: {},
      create: {
        id: 'vintage-rule',
        name: 'Vintage Komisyonu',
        ruleType: CommissionRuleType.category,
        categoryId: categories.find(c => c.slug === 'araba')?.id,
        sellerType: CommissionSellerType.ALL,
        appliesTo: 'SELLER',
        sellerRate: 7.0,
        percentage: 0.07,
        priority: 5,
        isActive: true,
      },
    }),
    prisma.commissionRule.upsert({
      where: { id: 'f1-rule' },
      update: {},
      create: {
        id: 'f1-rule',
        name: 'F1 Komisyonu',
        ruleType: CommissionRuleType.category,
        categoryId: categories.find(c => c.slug === 'motorspor')?.id,
        sellerType: CommissionSellerType.ALL,
        appliesTo: 'SELLER',
        sellerRate: 8.0,
        percentage: 0.08,
        priority: 5,
        isActive: true,
      },
    }),
    prisma.commissionRule.upsert({
      where: { id: 'platform-rule' },
      update: {},
      create: {
        id: 'platform-rule',
        name: 'Platform Satıcı',
        ruleType: CommissionRuleType.seller_type,
        sellerType: CommissionSellerType.BUSINESS,
        appliesTo: 'SELLER',
        sellerRate: 0.0,
        percentage: 0.0,
        priority: 10,
        isActive: true,
      },
    }),
    prisma.commissionRule.upsert({
      where: { id: 'verified-rule' },
      update: {},
      create: {
        id: 'verified-rule',
        name: 'Onaylı Satıcı İndirimi',
        ruleType: CommissionRuleType.seller_type,
        sellerType: CommissionSellerType.FREE,
        appliesTo: 'SELLER',
        sellerRate: 4.0,
        percentage: 0.04,
        priority: 3,
        isActive: true,
      },
    }),
  ]);

  console.log(`✅ Created ${commissionRules.length} commission rules`);

  // ==========================================================================
  // 4. Create Content Filters
  // ==========================================================================
  console.log('Creating content filters...');

  const contentFilters = await Promise.all([
    prisma.contentFilter.upsert({
      where: { id: 'phone-filter-1' },
      update: {},
      create: {
        id: 'phone-filter-1',
        filterType: 'phone',
        name: 'Türk Telefon Numarası',
        pattern: '(\\+90|0)?\\s*5\\d{2}\\s*\\d{3}\\s*\\d{2}\\s*\\d{2}',
        replacement: '[telefon gizlendi]',
        requiresApproval: true,
        priority: 10,
      },
    }),
    prisma.contentFilter.upsert({
      where: { id: 'email-filter' },
      update: {},
      create: {
        id: 'email-filter',
        filterType: 'email',
        name: 'E-posta Adresi',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        replacement: '[email gizlendi]',
        requiresApproval: true,
        priority: 10,
      },
    }),
    prisma.contentFilter.upsert({
      where: { id: 'whatsapp-filter' },
      update: {},
      create: {
        id: 'whatsapp-filter',
        filterType: 'social_media',
        name: 'WhatsApp',
        pattern: '(whatsapp|wp|wa)[\\s:]*[\\d+()-]+',
        replacement: '[iletişim bilgisi gizlendi]',
        requiresApproval: true,
        priority: 10,
      },
    }),
    prisma.contentFilter.upsert({
      where: { id: 'instagram-filter' },
      update: {},
      create: {
        id: 'instagram-filter',
        filterType: 'social_media',
        name: 'Instagram',
        pattern: '(instagram|ig|insta)[:\\s@]+[a-zA-Z0-9_.]+',
        replacement: '[sosyal medya gizlendi]',
        requiresApproval: true,
        priority: 8,
      },
    }),
  ]);

  console.log(`✅ Created ${contentFilters.length} content filters`);

  // ==========================================================================
  // 5. Create Platform Settings
  // ==========================================================================
  console.log('Creating platform settings...');

  const settings = await Promise.all([
    prisma.platformSetting.upsert({ where: { settingKey: 'offer_expiry_hours' }, update: {}, create: { settingKey: 'offer_expiry_hours', settingValue: '24', settingType: 'number', description: 'Tekliflerin geçerlilik süresi (saat)' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'payment_hold_days' }, update: {}, create: { settingKey: 'payment_hold_days', settingValue: '3', settingType: 'number', description: 'Ödeme bekletme süresi (gün)' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'min_offer_percentage' }, update: {}, create: { settingKey: 'min_offer_percentage', settingValue: '50', settingType: 'number', description: 'Minimum teklif yüzdesi' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'platform_name' }, update: {}, create: { settingKey: 'platform_name', settingValue: 'Tarodan', settingType: 'string', description: 'Platform adı' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'default_carrier' }, update: {}, create: { settingKey: 'default_carrier', settingValue: 'surat', settingType: 'string', description: 'Varsayılan kargo firması' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'trade_response_deadline_hours' }, update: {}, create: { settingKey: 'trade_response_deadline_hours', settingValue: '72', settingType: 'number', description: 'Takas teklifi yanıt süresi' } }),
  ]);

  console.log(`✅ Created ${settings.length} platform settings`);

  // ==========================================================================
  // 5b. Tax Regions, Rates & Rules (Türkiye KDV)
  // ==========================================================================
  console.log('Creating tax data...');

  const taxRegionTR = await prisma.taxRegion.upsert({
    where: { id: 'tax-region-tr' },
    update: {},
    create: {
      id: 'tax-region-tr',
      name: 'Türkiye',
      countryCode: 'TR',
      regionCode: null,
      isDefault: true,
      sortOrder: 0,
      isActive: true,
    },
  });

  const [taxRate20, taxRate10, taxRate1, taxRate0] = await Promise.all([
    prisma.taxRate.upsert({
      where: { id: 'tax-rate-kdv-20' },
      update: {},
      create: {
        id: 'tax-rate-kdv-20',
        taxRegionId: taxRegionTR.id,
        name: 'KDV %20',
        rate: 20,
        isDefault: true,
        sortOrder: 0,
        isActive: true,
      },
    }),
    prisma.taxRate.upsert({
      where: { id: 'tax-rate-kdv-10' },
      update: {},
      create: {
        id: 'tax-rate-kdv-10',
        taxRegionId: taxRegionTR.id,
        name: 'KDV %10',
        rate: 10,
        isDefault: false,
        sortOrder: 1,
        isActive: true,
      },
    }),
    prisma.taxRate.upsert({
      where: { id: 'tax-rate-kdv-1' },
      update: {},
      create: {
        id: 'tax-rate-kdv-1',
        taxRegionId: taxRegionTR.id,
        name: 'KDV %1',
        rate: 1,
        isDefault: false,
        sortOrder: 2,
        isActive: true,
      },
    }),
    prisma.taxRate.upsert({
      where: { id: 'tax-rate-kdv-0' },
      update: {},
      create: {
        id: 'tax-rate-kdv-0',
        taxRegionId: taxRegionTR.id,
        name: 'KDV Muaf',
        rate: 0,
        isDefault: false,
        sortOrder: 3,
        isActive: true,
      },
    }),
  ]);

  // Varsayılan kural: tüm ürünler için %20
  await prisma.taxRule.upsert({
    where: { id: 'tax-rule-tr-default' },
    update: {},
    create: {
      id: 'tax-rule-tr-default',
      taxRegionId: taxRegionTR.id,
      taxRateId: taxRate20.id,
      scope: 'default_rate',
      categoryId: null,
      priority: 0,
      isActive: true,
    },
  });

  console.log('✅ Created tax region (TR), 4 rates, 1 default rule');

  // ==========================================================================
  // 6. Create Users (20+ users with different roles)
  // ==========================================================================
  console.log('Creating users...');

  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const adminPasswordHash = await bcrypt.hash('Admin123!', 12);

  // Admin Users
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@tarodan.com' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'admin@tarodan.com',
      phone: '+905550000001',
      passwordHash: adminPasswordHash,
      displayName: 'Super Admin',
      isVerified: true,
      isEmailVerified: true,
      isSeller: false,
    },
  });

  const moderator = await prisma.user.upsert({
    where: { email: 'moderator@tarodan.com' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'moderator@tarodan.com',
      phone: '+905550000002',
      passwordHash: adminPasswordHash,
      displayName: 'Platform Moderator',
      isVerified: true,
      isEmailVerified: true,
      isSeller: false,
    },
  });

  // Admin records
  await prisma.adminUser.upsert({
    where: { userId: superAdmin.id },
    update: { role: AdminRole.super_admin },
    create: {
      userId: superAdmin.id,
      role: AdminRole.super_admin,
      permissions: { all: true },
      isActive: true,
    },
  });

  await prisma.adminUser.upsert({
    where: { userId: moderator.id },
    update: { role: AdminRole.moderator },
    create: {
      userId: moderator.id,
      role: AdminRole.moderator,
      permissions: { products: { read: true, approve: true }, messages: { read: true, moderate: true } },
      isActive: true,
    },
  });

  // Tarodan central warehouse address — required for safe-trade escrow.
  // admin.service.ts → resolveWarehouseAddressId reads the
  // `warehouse_address_id` platform setting; without it, approveWarehouseTrade
  // throws BadRequestException("Depo adresi yapılandırılmamış").
  const existingWarehouseAddr = await prisma.address.findFirst({
    where: { userId: superAdmin.id, title: 'Tarodan Deposu' },
  });
  const warehouseAddress = existingWarehouseAddr ?? await prisma.address.create({
    data: {
      userId: superAdmin.id,
      title: 'Tarodan Deposu',
      fullName: 'Tarodan Lojistik',
      phone: '+905000000000',
      city: 'İstanbul',
      district: 'Kadıköy',
      address: 'Tarodan Depo, Hasanpaşa Mah., Test Sok. No:1',
      zipCode: '34722',
      isDefault: false,
    },
  });
  await prisma.platformSetting.upsert({
    where: { settingKey: 'warehouse_address_id' },
    update: { settingValue: warehouseAddress.id },
    create: {
      settingKey: 'warehouse_address_id',
      settingValue: warehouseAddress.id,
      settingType: 'string',
      description: 'Tarodan central warehouse address ID for safe-trade escrow',
    },
  });
  console.log(`✅ Warehouse address ready: ${warehouseAddress.id}`);

  // Platform Seller
  const platformSeller = await prisma.user.upsert({
    where: { email: 'platform@tarodan.com' },
    update: {},
    create: {
      email: 'platform@tarodan.com',
      phone: '+905550000003',
      passwordHash: passwordHash,
      displayName: 'Tarodan Official Store',
      bio: 'Resmi Tarodan mağazası. Garantili ürünler.',
      isVerified: true,
      isEmailVerified: true,
      isSeller: true,
      sellerType: SellerType.platform,
    },
  });

  // Create diverse user base
  const userNames = [
    { name: 'Ahmet Koleksiyoncu', email: 'ahmet@demo.com', bio: 'Hot Wheels tutkunu, 15 yıllık koleksiyoncu', seller: true, type: SellerType.verified },
    { name: 'Mehmet Diecast', email: 'mehmet@demo.com', bio: 'JDM modeller konusunda uzman', seller: true, type: SellerType.individual },
    { name: 'Ayşe Vintage', email: 'ayse@demo.com', bio: 'Vintage diecast uzmanı', seller: true, type: SellerType.verified },
    { name: 'Fatma Collector', email: 'fatma@demo.com', bio: '1:18 ölçekli premium koleksiyoncu', seller: true, type: SellerType.individual },
    { name: 'Ali Premium', email: 'ali@demo.com', bio: 'Premium ve RLC modeller', seller: true, type: SellerType.verified, companyName: 'Premium Diecast Store' },
    { name: 'Zeynep Hobici', email: 'zeynep@demo.com', bio: 'Yeni başlayan koleksiyoncu', seller: true, type: SellerType.individual },
    { name: 'Mustafa Trader', email: 'mustafa@demo.com', bio: 'Takas yapmayı severim', seller: true, type: SellerType.individual },
    { name: 'Elif Modelist', email: 'elif@demo.com', bio: 'Matchbox ve Majorette koleksiyoncusu', seller: true, type: SellerType.individual },
    { name: 'Emre JDM', email: 'emre@demo.com', bio: 'Sadece Japon arabaları', seller: true, type: SellerType.individual },
    { name: 'Selin European', email: 'selin@demo.com', bio: 'Avrupa klasikleri koleksiyoncusu', seller: true, type: SellerType.individual },
    { name: 'Burak American', email: 'burak@demo.com', bio: 'Amerikan kas arabaları tutkunuı', seller: true, type: SellerType.individual },
    { name: 'Deniz Buyer', email: 'deniz@demo.com', bio: 'Sadece alıcı', seller: false, type: null },
    { name: 'Ceren Yeni', email: 'ceren@demo.com', bio: 'Yeni üye', seller: false, type: null },
    { name: 'Kaan Meraklı', email: 'kaan@demo.com', bio: 'Meraklı koleksiyoncu', seller: false, type: null },
    { name: 'İrem Hobici', email: 'irem@demo.com', bio: 'Hobi olarak topluyorum', seller: true, type: SellerType.individual },
  ];

  const users: any[] = [superAdmin, moderator, platformSeller];

  for (let i = 0; i < userNames.length; i++) {
    const u = userNames[i];
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        companyName: (u as any).companyName || undefined,
      },
      create: {
        email: u.email,
        phone: `+90555${String(i + 100).padStart(7, '0')}`,
        passwordHash: passwordHash,
        displayName: u.name,
        bio: u.bio,
        isVerified: true,
        isEmailVerified: true,
        isSeller: u.seller,
        sellerType: u.type,
        companyName: (u as any).companyName || null,
      },
    });
    users.push(user);
  }

  console.log(`✅ Created ${users.length} users`);

  // ==========================================================================
  // 7. Create User Memberships
  // ==========================================================================
  console.log('Creating user memberships...');

  const freeTier = membershipTiers.find(t => t.type === MembershipTierType.free)!;
  const basicTier = membershipTiers.find(t => t.type === MembershipTierType.basic)!;
  const premiumTier = membershipTiers.find(t => t.type === MembershipTierType.premium)!;
  const businessTier = membershipTiers.find(t => t.type === MembershipTierType.business)!;

  const now = new Date();
  const oneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  // Assign tiers to users
  const tierAssignments = [
    { userId: users[3].id, tierId: premiumTier.id }, // Ahmet - Premium
    { userId: users[4].id, tierId: basicTier.id }, // Mehmet - Basic
    { userId: users[5].id, tierId: premiumTier.id }, // Ayşe - Premium
    { userId: users[6].id, tierId: basicTier.id }, // Fatma - Basic
    { userId: users[7].id, tierId: businessTier.id }, // Ali - Business
    { userId: users[8].id, tierId: freeTier.id }, // Zeynep - Free
    { userId: users[9].id, tierId: basicTier.id }, // Mustafa - Basic
    { userId: users[10].id, tierId: freeTier.id }, // Elif - Free
    { userId: users[11].id, tierId: basicTier.id }, // Emre - Basic
    { userId: users[12].id, tierId: freeTier.id }, // Selin - Free
    { userId: users[13].id, tierId: freeTier.id }, // Burak - Free
    { userId: users[14].id, tierId: freeTier.id }, // Deniz - Free
    { userId: users[15].id, tierId: freeTier.id }, // Ceren - Free
    { userId: users[16].id, tierId: freeTier.id }, // Kaan - Free
    { userId: users[17].id, tierId: basicTier.id }, // İrem - Basic
  ];

  for (const ta of tierAssignments) {
    await prisma.userMembership.upsert({
      where: { userId: ta.userId },
      update: {
        tierId: ta.tierId,
        status: SubscriptionStatus.active,
        currentPeriodStart: now,
        currentPeriodEnd: oneYearLater,
      },
      create: {
        userId: ta.userId,
        tierId: ta.tierId,
        status: SubscriptionStatus.active,
        currentPeriodStart: now,
        currentPeriodEnd: oneYearLater,
      },
    });
  }

  console.log(`✅ Created ${tierAssignments.length} user memberships`);

  // Users who can trade (basic/premium/business) – basic also has canTrade: true
  const canTradeUserIds = new Set(
    tierAssignments
      .filter(ta => ta.tierId === basicTier.id || ta.tierId === premiumTier.id || ta.tierId === businessTier.id)
      .map(ta => ta.userId),
  );

  // ==========================================================================
  // 8. Create Addresses
  // ==========================================================================
  console.log('Creating addresses...');

  const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep'];
  const districts = ['Kadıköy', 'Çankaya', 'Konak', 'Nilüfer', 'Muratpaşa', 'Seyhan', 'Selçuklu', 'Şahinbey'];

  const addresses: any[] = [];
  for (let i = 3; i < users.length; i++) {
    const city = cities[i % cities.length];
    const district = districts[i % districts.length];
    // Check if address already exists for this user
    const existingAddress = await prisma.address.findFirst({
      where: {
        userId: users[i].id,
        title: 'Ev',
      },
    });
    
    if (!existingAddress) {
      // Let Prisma generate UUID automatically (don't set id manually)
      const address = await prisma.address.create({
        data: {
          userId: users[i].id,
          title: 'Ev',
          fullName: users[i].displayName,
          phone: users[i].phone || '+905550000000',
          city: city,
          district: district,
          address: `${users[i].displayName} Mahallesi, Koleksiyon Sokak No: ${i}`,
          zipCode: `${34000 + i * 100}`,
          isDefault: true,
        },
      });
      addresses.push(address);
    } else {
      addresses.push(existingAddress);
    }
  }

  console.log(`✅ Created ${addresses.length} addresses`);

  // ==========================================================================
  // 9. Create Wishlists
  // ==========================================================================
  console.log('Creating wishlists...');

  for (let i = 3; i < users.length; i++) {
    await prisma.wishlist.upsert({
      where: { userId: users[i].id },
      update: {},
      create: { userId: users[i].id },
    });
  }

  console.log(`✅ Created wishlists for all users`);

  // ==========================================================================
  // 10. Create Products (85 unique products – one per image)
  // ==========================================================================
  console.log('Creating products...');

  // Each entry maps 1:1 to a generated image file
  const productData: Array<{
    img: string; title: string; desc: string; cat: string;
    brandSlug?: string; modelSlug?: string; mfgSlug?: string;
    scale: string; material: string; year: number;
    min: number; max: number; cond: ProductCondition;
    isSet?: boolean; isLimited?: boolean; isPreorder?: boolean;
  }> = [
    // ── ARABA – Vintage (1-11) ──────────────────────────────────────────
    { img: 'product-hot-wheels-ferrari-275-gtb.png', title: 'Hot Wheels Ferrari 275 GTB', desc: '1964 model Ferrari 275 GTB\'nin Hot Wheels üretimi 1:64 ölçekli diecast modeli. Klasik kırmızı renk, koleksiyonluk durumda.', cat: 'araba', brandSlug: 'ferrari', modelSlug: 'ferrari-275-gtb', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 1964, min: 850, max: 1500, cond: ProductCondition.good },
    { img: 'product-matchbox-james-bond-aston-martin.png', title: 'Matchbox 007 Aston Martin DB5', desc: 'James Bond filmleriyle efsaneleşen Aston Martin DB5. Matchbox üretimi, gümüş renk, 1:64 ölçek.', cat: 'araba', brandSlug: 'aston-martin', modelSlug: 'aston-martin-db5', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 1965, min: 600, max: 1200, cond: ProductCondition.good },
    { img: 'product-tamiya-vintage-1950s.png', title: 'Tamiya 1950s Vintage Classic', desc: '1950\'lerin zarif iki tonlu Amerikan klasiğinin Tamiya 1:24 ölçekli detaylı modeli.', cat: 'araba', mfgSlug: 'tamiya', scale: '1:24', material: 'composite', year: 1955, min: 350, max: 700, cond: ProductCondition.good },
    { img: 'product-autoart-mercedes-300sl-gullwing.png', title: 'AUTOart Mercedes 300SL Gullwing 1:18', desc: 'Mercedes-Benz 300SL Gullwing\'in AUTOart premium 1:18 ölçekli modeli. Açılır martı kanatları, gümüş renk, vitrin kalitesi.', cat: 'araba', brandSlug: 'mercedes-benz', modelSlug: 'mercedes-300sl-gullwing', mfgSlug: 'autoart', scale: '1:18', material: 'diecast', year: 1955, min: 2800, max: 4500, cond: ProductCondition.like_new },
    { img: 'product-kyosho-porsche-356.png', title: 'Kyosho Porsche 356 Speedster 1:18', desc: 'Porsche 356 Speedster\'ın Kyosho 1:18 ölçekli el yapımı kalitesinde modeli. Fildişi beyaz, klasik eğriler.', cat: 'araba', brandSlug: 'porsche', modelSlug: 'porsche-356', mfgSlug: 'kyosho', scale: '1:18', material: 'diecast', year: 1956, min: 1200, max: 2200, cond: ProductCondition.like_new },
    { img: 'product-maisto-corvette-1963.png', title: 'Maisto 1963 Corvette Stingray 1:24', desc: '1963 Chevrolet Corvette Stingray split-window coupe. Maisto 1:24, parlak kırmızı.', cat: 'araba', brandSlug: 'chevrolet', modelSlug: 'chevrolet-corvette-c2', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 1963, min: 250, max: 500, cond: ProductCondition.good },
    { img: 'product-bburago-alfa-romeo.png', title: 'Bburago Alfa Romeo Giulia GTA 1:24', desc: 'Alfa Romeo Giulia Sprint GTA\'nın Bburago üretimi 1:24 modeli. Koyu bordo, İtalyan yarış ruhu.', cat: 'araba', brandSlug: 'alfa-romeo', modelSlug: 'alfa-romeo-giulia-gta', mfgSlug: 'bburago', scale: '1:24', material: 'diecast', year: 1965, min: 300, max: 600, cond: ProductCondition.good },
    { img: 'product-greenlight-vintage-collection.png', title: 'Greenlight 1960 Ford Thunderbird', desc: '1960 Ford Thunderbird\'ün Greenlight 1:64 ölçekli modeli. Pastel nane yeşili, krom detaylar.', cat: 'araba', brandSlug: 'ford', modelSlug: 'ford-thunderbird', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 1960, min: 180, max: 350, cond: ProductCondition.good },
    { img: 'product-majorette-vintage-set.png', title: 'Majorette VW Beetle Classic', desc: 'Volkswagen Beetle\'ın Majorette 1:64 ölçekli sevimli modeli. Güneş sarısı, retro tarz.', cat: 'araba', brandSlug: 'volkswagen', modelSlug: 'volkswagen-beetle', mfgSlug: 'majorette', scale: '1:64', material: 'diecast', year: 1967, min: 120, max: 250, cond: ProductCondition.good },
    { img: 'product-tomica-limited-vintage.png', title: 'Tomica Limited Vintage Toyota 2000GT', desc: 'Toyota 2000GT\'nin Tomica Limited Vintage serisi 1:64 modeli. İnci beyaz, kırmızı iç mekan, Japon zarafeti.', cat: 'araba', brandSlug: 'toyota', modelSlug: 'toyota-2000gt', mfgSlug: 'tomica', scale: '1:64', material: 'diecast', year: 1967, min: 450, max: 900, cond: ProductCondition.new, isLimited: true },
    { img: 'product-minichamps-vintage-racing.png', title: 'Minichamps Porsche 917K Gulf 1:43', desc: 'Porsche 917K efsanevi Gulf renkleriyle Minichamps 1:43 ölçekli yarış modeli. Turuncu-mavi, Le Mans ruhu.', cat: 'araba', brandSlug: 'porsche', modelSlug: 'porsche-917k', mfgSlug: 'minichamps', scale: '1:43', material: 'resin', year: 1970, min: 800, max: 1500, cond: ProductCondition.like_new },

    // ── ARABA – Sports (12-24) ──────────────────────────────────────────
    { img: 'product-hot-wheels-nissan-skyline-gtr-r34.png', title: 'Hot Wheels Nissan Skyline GT-R R34', desc: 'JDM efsanesi R34 GT-R\'ın Hot Wheels 1:64 modeli. Gece moru, agresif duruş.', cat: 'araba', brandSlug: 'nissan', modelSlug: 'nissan-skyline-gtr-r34', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 1999, min: 150, max: 400, cond: ProductCondition.new },
    { img: 'product-hot-wheels-porsche-911-gt3-rs.png', title: 'Hot Wheels Porsche 911 GT3 RS', desc: 'Porsche 911 GT3 RS\'in Hot Wheels 1:64 modeli. Asit yeşili, siyah aksan, agresif duruş.', cat: 'araba', brandSlug: 'porsche', modelSlug: 'porsche-911-gt3-rs', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2022, min: 120, max: 350, cond: ProductCondition.new },
    { img: 'product-hot-wheels-lamborghini-aventador.png', title: 'Hot Wheels Lamborghini Aventador', desc: 'Lamborghini Aventador süper otomobilin Hot Wheels 1:64 modeli. Parlak turuncu, dramatik tasarım.', cat: 'araba', brandSlug: 'lamborghini', modelSlug: 'lamborghini-aventador', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2011, min: 100, max: 300, cond: ProductCondition.new },
    { img: 'product-matchbox-mclaren-p1.png', title: 'Matchbox McLaren P1', desc: 'McLaren P1 hipercar Matchbox 1:64 modeli. Volkan sarısı, fütüristik tasarım.', cat: 'araba', brandSlug: 'mclaren', modelSlug: 'mclaren-p1', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 2013, min: 80, max: 250, cond: ProductCondition.new },
    { img: 'product-tamiya-toyota-supra-mk4.png', title: 'Tamiya Toyota Supra MK4 1:24', desc: 'Efsanevi Toyota Supra A80\'in Tamiya 1:24 detaylı modeli. Beyaz, büyük arka kanat, tuner ikonu.', cat: 'araba', brandSlug: 'toyota', modelSlug: 'toyota-supra-mk4', mfgSlug: 'tamiya', scale: '1:24', material: 'composite', year: 1993, min: 400, max: 800, cond: ProductCondition.new },
    { img: 'product-autoart-lamborghini-huracan-118.png', title: 'AUTOart Lamborghini Huracan 1:18', desc: 'Lamborghini Huracan\'ın AUTOart premium 1:18 modeli. Verde Mantis yeşil, açılır kapılar, olağanüstü detay.', cat: 'araba', brandSlug: 'lamborghini', modelSlug: 'lamborghini-huracan', mfgSlug: 'autoart', scale: '1:18', material: 'diecast', year: 2014, min: 3500, max: 5500, cond: ProductCondition.new },
    { img: 'product-kyosho-nissan-gtr-r35-118.png', title: 'Kyosho Nissan GT-R R35 1:18', desc: 'Nissan GT-R R35\'in Kyosho 1:18 premium modeli. Metalik koyu mavi, kaslı çamurluklar.', cat: 'araba', brandSlug: 'nissan', modelSlug: 'nissan-gtr-r35', mfgSlug: 'kyosho', scale: '1:18', material: 'diecast', year: 2007, min: 2800, max: 4800, cond: ProductCondition.new },
    { img: 'product-maisto-ferrari-f8-tributo-124.png', title: 'Maisto Ferrari F8 Tributo 1:24', desc: 'Ferrari F8 Tributo\'nun Maisto 1:24 modeli. Rosso corsa kırmızı, İtalyan mükemmelliği.', cat: 'araba', brandSlug: 'ferrari', modelSlug: 'ferrari-f8-tributo', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 2019, min: 250, max: 500, cond: ProductCondition.new },
    { img: 'product-bburago-lamborghini-aventador-124.png', title: 'Bburago Lamborghini Aventador 1:24', desc: 'Lamborghini Aventador\'un Bburago 1:24 modeli. Mat siyah, gizli görünüm, stealth modu.', cat: 'araba', brandSlug: 'lamborghini', modelSlug: 'lamborghini-aventador', mfgSlug: 'bburago', scale: '1:24', material: 'diecast', year: 2011, min: 200, max: 450, cond: ProductCondition.new },
    { img: 'product-greenlight-sports-car-series.png', title: 'Greenlight Chevrolet Corvette C8', desc: 'Yeni nesil Corvette C8\'in Greenlight 1:64 modeli. Rapid Blue, modern spor araba.', cat: 'araba', brandSlug: 'chevrolet', modelSlug: 'chevrolet-corvette-c8', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 2020, min: 120, max: 300, cond: ProductCondition.new },
    { img: 'product-majorette-porsche-911-turbo.png', title: 'Majorette Porsche 911 Turbo', desc: 'Porsche 911 Turbo\'nun Majorette 1:64 küçük ama detaylı modeli. Guards kırmızı, ikonik balina kuyruğu spoiler.', cat: 'araba', brandSlug: 'porsche', modelSlug: 'porsche-911-turbo', mfgSlug: 'majorette', scale: '1:64', material: 'diecast', year: 2020, min: 50, max: 120, cond: ProductCondition.new },
    { img: 'product-tomica-honda-nsx-type-r.png', title: 'Tomica Honda NSX Type-R', desc: 'Honda NSX Type-R\'ın Tomica 1:64 modeli. Championship beyaz, orta motorlu Japon süper araba.', cat: 'araba', brandSlug: 'honda', modelSlug: 'honda-nsx-type-r', mfgSlug: 'tomica', scale: '1:64', material: 'diecast', year: 2002, min: 180, max: 400, cond: ProductCondition.new },
    { img: 'product-minichamps-sports-car-143.png', title: 'Minichamps BMW M4 1:43', desc: 'BMW M4\'ün Minichamps 1:43 ölçekli premium modeli. Isle of Man yeşil, kompakt kalite.', cat: 'araba', brandSlug: 'bmw', modelSlug: 'bmw-m4', mfgSlug: 'minichamps', scale: '1:43', material: 'resin', year: 2021, min: 500, max: 900, cond: ProductCondition.new },

    // ── ARABA – Muscle (25-33) ──────────────────────────────────────────
    { img: 'product-hot-wheels-dodge-challenger-1970.png', title: 'Hot Wheels 1970 Dodge Challenger R/T', desc: '1970 Dodge Challenger R/T\'nin Hot Wheels 1:64 modeli. Plum Crazy mor, kas araba ikonu.', cat: 'araba', brandSlug: 'dodge', modelSlug: 'dodge-challenger-rt', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 1970, min: 120, max: 300, cond: ProductCondition.new },
    { img: 'product-hot-wheels-ford-mustang-mach1-1971.png', title: 'Hot Wheels 1971 Mustang Mach 1', desc: '1971 Ford Mustang Mach 1 Hot Wheels 1:64. Grabber mavisi, siyah çizgiler, Amerikan gücü.', cat: 'araba', brandSlug: 'ford', modelSlug: 'ford-mustang-mach-1', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 1971, min: 150, max: 350, cond: ProductCondition.new },
    { img: 'product-matchbox-ford-mustang-boss-429.png', title: 'Matchbox Ford Mustang Boss 429', desc: '1970 Ford Mustang Boss 429 Matchbox 1:64. Calypso mercan turuncu, nadir boss.', cat: 'araba', brandSlug: 'ford', modelSlug: 'ford-mustang-boss-429', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 1970, min: 200, max: 450, cond: ProductCondition.good },
    { img: 'product-greenlight-muscle-car-garage.png', title: 'Greenlight Pontiac GTO Judge', desc: 'Pontiac GTO Judge Greenlight 1:64. Orbit turuncu, klasik kas araba.', cat: 'araba', brandSlug: 'pontiac', modelSlug: 'pontiac-gto-judge', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 1969, min: 120, max: 280, cond: ProductCondition.new },
    { img: 'product-greenlight-route66-muscle.png', title: 'Greenlight Chevrolet Chevelle SS', desc: 'Chevrolet Chevelle SS Greenlight 1:64. Kızılcık kırmızı, parlayan krom tamponlar.', cat: 'araba', brandSlug: 'chevrolet', modelSlug: 'chevrolet-chevelle-ss', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 1970, min: 150, max: 350, cond: ProductCondition.like_new },
    { img: 'product-maisto-chevrolet-camaro-ss-1969.png', title: 'Maisto 1969 Camaro SS 1:24', desc: '1969 Chevrolet Camaro SS Maisto 1:24. Hugger turuncu, beyaz yarış çizgileri, drag racer görünüm.', cat: 'araba', brandSlug: 'chevrolet', modelSlug: 'chevrolet-camaro-ss', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 1969, min: 250, max: 500, cond: ProductCondition.like_new },
    { img: 'product-bburago-dodge-charger-1970.png', title: 'Bburago 1970 Dodge Charger 1:24', desc: '1970 Dodge Charger Bburago 1:24. Parlak siyah, tehditkar ve güçlü.', cat: 'araba', brandSlug: 'dodge', modelSlug: 'dodge-charger', mfgSlug: 'bburago', scale: '1:24', material: 'diecast', year: 1970, min: 200, max: 450, cond: ProductCondition.new },
    { img: 'product-autoart-plymouth-barracuda-118.png', title: 'AUTOart Plymouth Barracuda 1:18', desc: 'Plymouth Barracuda AUTOart premium 1:18. Lime yeşil, kaput girişi, olağanüstü detay.', cat: 'araba', brandSlug: 'plymouth', modelSlug: 'plymouth-barracuda', mfgSlug: 'autoart', scale: '1:18', material: 'diecast', year: 1970, min: 3000, max: 5500, cond: ProductCondition.new },
    { img: 'product-kyosho-ford-mustang-gt500-118.png', title: 'Kyosho Ford Mustang Shelby GT500 1:18', desc: 'Ford Mustang Shelby GT500 Kyosho 1:18. Wimbledon beyaz, mavi yarış çizgileri.', cat: 'araba', brandSlug: 'ford', modelSlug: 'ford-mustang-gt500', mfgSlug: 'kyosho', scale: '1:18', material: 'diecast', year: 1967, min: 2500, max: 4500, cond: ProductCondition.new },

    // ── KAMYON / SUV (34-42) ────────────────────────────────────────────
    { img: 'product-hot-wheels-ford-f150-raptor-2023.png', title: 'Hot Wheels Ford F-150 Raptor 2023', desc: 'Ford F-150 Raptor Hot Wheels 1:64. Velocity mavisi, off-road kamyon.', cat: 'kamyon', brandSlug: 'ford', modelSlug: 'ford-f150-raptor', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2023, min: 80, max: 200, cond: ProductCondition.new },
    { img: 'product-matchbox-land-rover-defender.png', title: 'Matchbox Land Rover Defender 90', desc: 'Land Rover Defender 90 Matchbox 1:64. Pangea yeşil, macera aracı.', cat: 'kamyon', brandSlug: 'land-rover', modelSlug: 'land-rover-defender', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 2020, min: 70, max: 180, cond: ProductCondition.new },
    { img: 'product-tamiya-toyota-land-cruiser-j70.png', title: 'Tamiya Toyota Land Cruiser J70 1:24', desc: 'Toyota Land Cruiser J70 Tamiya 1:24. Kumlu bej, sert ekspedisyon görünümü.', cat: 'kamyon', brandSlug: 'toyota', modelSlug: 'toyota-land-cruiser-j70', mfgSlug: 'tamiya', scale: '1:24', material: 'composite', year: 1984, min: 350, max: 700, cond: ProductCondition.like_new },
    { img: 'product-maisto-jeep-wrangler-rubicon.png', title: 'Maisto Jeep Wrangler Rubicon 1:24', desc: 'Jeep Wrangler Rubicon Maisto 1:24. Ateş kırmızı, siyah tavan, patika hazır.', cat: 'kamyon', brandSlug: 'jeep', modelSlug: 'jeep-wrangler-rubicon', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 2021, min: 200, max: 450, cond: ProductCondition.new },
    { img: 'product-bburago-mercedes-g-class.png', title: 'Bburago Mercedes G63 AMG 1:24', desc: 'Mercedes G-Class G63 AMG Bburago 1:24. Obsidyen siyah, lüks SUV.', cat: 'kamyon', brandSlug: 'mercedes-benz', modelSlug: 'mercedes-g-class', mfgSlug: 'bburago', scale: '1:24', material: 'diecast', year: 2018, min: 250, max: 500, cond: ProductCondition.new },
    { img: 'product-greenlight-pickup-truck-series.png', title: 'Greenlight Chevrolet Silverado', desc: 'Chevrolet Silverado Greenlight 1:64. Summit beyaz, iş kamyonu.', cat: 'kamyon', brandSlug: 'chevrolet', modelSlug: 'chevrolet-silverado', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 2022, min: 80, max: 200, cond: ProductCondition.new },
    { img: 'product-majorette-suv-collection.png', title: 'Majorette Range Rover Sport', desc: 'Range Rover Sport Majorette 1:64. Firenze kırmızı metalik, İngiliz lüksü.', cat: 'kamyon', brandSlug: 'land-rover', mfgSlug: 'majorette', scale: '1:64', material: 'diecast', year: 2022, min: 50, max: 120, cond: ProductCondition.new },
    { img: 'product-tomica-toyota-hilux.png', title: 'Tomica Toyota Hilux', desc: 'Toyota Hilux Tomica 1:64. Kırmızı, güvenilir iş atı.', cat: 'kamyon', brandSlug: 'toyota', modelSlug: 'toyota-hilux', mfgSlug: 'tomica', scale: '1:64', material: 'diecast', year: 2020, min: 70, max: 180, cond: ProductCondition.new },
    { img: 'product-autoart-ford-f150-raptor-118.png', title: 'AUTOart Ford F-150 Raptor 1:18', desc: 'Ford F-150 Raptor AUTOart premium 1:18. Code turuncu, off-road detay.', cat: 'kamyon', brandSlug: 'ford', modelSlug: 'ford-f150-raptor', mfgSlug: 'autoart', scale: '1:18', material: 'diecast', year: 2021, min: 3000, max: 5000, cond: ProductCondition.new },

    // ── MOTORSPOR / F1 (43-51) ──────────────────────────────────────────
    { img: 'product-hot-wheels-formula-1-collection.png', title: 'Hot Wheels F1 Ferrari Livery', desc: 'F1 yarış arabası Hot Wheels 1:64. Kırmızı Ferrari renkleri, açık tekerlekli yarış.', cat: 'motorspor', brandSlug: 'ferrari', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2023, min: 150, max: 350, cond: ProductCondition.new },
    { img: 'product-matchbox-f1-racing-set.png', title: 'Matchbox F1 McLaren Papaya', desc: 'F1 arabası Matchbox 1:64. Papaya turuncu McLaren renkleri, aerodinamik tasarım.', cat: 'motorspor', brandSlug: 'mclaren', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 2023, min: 120, max: 300, cond: ProductCondition.new },
    { img: 'product-tamiya-f1-model-kit.png', title: 'Tamiya F1 Mercedes AMG 1:24', desc: 'F1 Mercedes AMG Tamiya 1:24. Gümüş renk, turkuaz aksan, detaylı model kit.', cat: 'motorspor', brandSlug: 'mercedes-benz', mfgSlug: 'tamiya', scale: '1:24', material: 'composite', year: 2023, min: 500, max: 1000, cond: ProductCondition.new },
    { img: 'product-autoart-f1-championship-118.png', title: 'AUTOart F1 Red Bull Racing 1:18', desc: 'F1 Red Bull Racing AUTOart premium 1:18. Koyu mavi, sarı aksan, şampiyonluk detayı.', cat: 'motorspor', mfgSlug: 'autoart', scale: '1:18', material: 'diecast', year: 2023, min: 4000, max: 7000, cond: ProductCondition.new },
    { img: 'product-kyosho-formula-1-118.png', title: 'Kyosho F1 Aston Martin 1:18', desc: 'F1 Aston Martin Kyosho 1:18. British racing yeşil, premium kalite.', cat: 'motorspor', brandSlug: 'aston-martin', mfgSlug: 'kyosho', scale: '1:18', material: 'diecast', year: 2023, min: 3500, max: 6000, cond: ProductCondition.new },
    { img: 'product-maisto-f1-racing-collection.png', title: 'Maisto F1 Alpine Blue 1:24', desc: 'F1 Alpine Maisto 1:24. Mavi, Fransız bayrağı aksan.', cat: 'motorspor', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 2023, min: 300, max: 600, cond: ProductCondition.new },
    { img: 'product-bburago-f1-championship-series.png', title: 'Bburago F1 Lotus JPS 1:43', desc: 'Klasik F1 Lotus JPS Bburago 1:43. Siyah-altın, efsanevi yarış renkleri.', cat: 'motorspor', mfgSlug: 'bburago', scale: '1:43', material: 'diecast', year: 1978, min: 250, max: 500, cond: ProductCondition.new },
    { img: 'product-minichamps-f1-racing-143.png', title: 'Minichamps F1 Williams 1:43', desc: 'F1 Williams Minichamps 1:43. Beyaz-mavi, kompakt hassasiyet.', cat: 'motorspor', mfgSlug: 'minichamps', scale: '1:43', material: 'resin', year: 2023, min: 500, max: 900, cond: ProductCondition.new },
    { img: 'product-greenlight-f1-legends.png', title: 'Greenlight Vintage F1 Gulf Livery', desc: 'Vintage F1 aracı Greenlight 1:64. Gulf açık mavi-turuncu, retro yarış.', cat: 'motorspor', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 1970, min: 150, max: 350, cond: ProductCondition.new },

    // ── ARABA – Custom (52-60) ──────────────────────────────────────────
    { img: 'product-hot-wheels-custom-nissan-skyline.png', title: 'Hot Wheels Custom Skyline GTR Widebody', desc: 'Custom Nissan Skyline GT-R widebody kit, metalik gece mavisi, neon yeşil aksan. Hot Wheels 1:64, tuner stil.', cat: 'araba', brandSlug: 'nissan', modelSlug: 'nissan-skyline-gtr-r34', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2020, min: 200, max: 500, cond: ProductCondition.new },
    { img: 'product-hot-wheels-custom-paint-collection.png', title: 'Hot Wheels Chrome Colorshift Custom', desc: 'Rainbow krom renk değiştiren boya, dikkat çekici custom. Hot Wheels 1:64.', cat: 'araba', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2024, min: 150, max: 400, cond: ProductCondition.new },
    { img: 'product-matchbox-custom-build-series.png', title: 'Matchbox Custom Rat Rod', desc: 'Custom rat rod, düz primer gri, açık motor. Matchbox 1:64, ham yapı stili.', cat: 'araba', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 1932, min: 120, max: 300, cond: ProductCondition.new },
    { img: 'product-tamiya-custom-drift-car.png', title: 'Tamiya Custom Drift AE86 Panda', desc: 'Drift-spec Toyota AE86, siyah-beyaz panda boyası, açılı tekerlekler. Tamiya 1:24, drift kültürü.', cat: 'araba', brandSlug: 'toyota', modelSlug: 'toyota-ae86', mfgSlug: 'tamiya', scale: '1:24', material: 'composite', year: 1985, min: 500, max: 1000, cond: ProductCondition.new },
    { img: 'product-greenlight-custom-hot-rod.png', title: 'Greenlight 1932 Ford Hot Rod', desc: 'Custom 1932 Ford hot rod, şeker elma kırmızı, alev desenleri. Greenlight 1:64, klasik hot rod.', cat: 'araba', brandSlug: 'ford', mfgSlug: 'greenlight', scale: '1:64', material: 'diecast', year: 1932, min: 180, max: 400, cond: ProductCondition.new },
    { img: 'product-maisto-custom-lowrider.png', title: 'Maisto Custom Lowrider Impala', desc: 'Custom lowrider Chevrolet Impala, metalik mor, altın tel jantlar. Maisto 1:24, lowrider kültürü.', cat: 'araba', brandSlug: 'chevrolet', modelSlug: 'chevrolet-impala', mfgSlug: 'maisto', scale: '1:24', material: 'diecast', year: 1964, min: 250, max: 550, cond: ProductCondition.new },
    { img: 'product-bburago-custom-tuning-series.png', title: 'Bburago Custom Tuned Honda Civic', desc: 'Custom tuned Honda Civic, elektrik mavisi, karbon fiber kaput. Bburago 1:24, tuning sahnesi.', cat: 'araba', brandSlug: 'honda', modelSlug: 'honda-civic', mfgSlug: 'bburago', scale: '1:24', material: 'diecast', year: 2000, min: 200, max: 450, cond: ProductCondition.new },
    { img: 'product-majorette-custom-racing.png', title: 'Majorette Porsche Martini Racing', desc: 'Custom Porsche Martini yarış çizgileri, beyaz. Majorette 1:64, motorsport stili.', cat: 'araba', brandSlug: 'porsche', mfgSlug: 'majorette', scale: '1:64', material: 'diecast', year: 2020, min: 80, max: 200, cond: ProductCondition.new },
    { img: 'product-tomica-custom-modified.png', title: 'Tomica Custom Mazda RX-7 FD', desc: 'Custom modified Mazda RX-7 FD, gün batımı turuncu, siyah spoiler. Tomica 1:64, Japon tuner.', cat: 'araba', brandSlug: 'mazda', modelSlug: 'mazda-rx-7', mfgSlug: 'tomica', scale: '1:64', material: 'diecast', year: 1992, min: 250, max: 500, cond: ProductCondition.new },

    // ── MOTOSİKLET (61-65) ──────────────────────────────────────────────
    { img: 'product-maisto-ducati-panigale-v4.png', title: 'Maisto Ducati Panigale V4 1:18', desc: 'Ducati Panigale V4 Maisto 1:18. Kırmızı-beyaz, İtalyan süper motosiklet.', cat: 'motosiklet', brandSlug: 'ducati', modelSlug: 'ducati-panigale-v4', mfgSlug: 'maisto', scale: '1:18', material: 'diecast', year: 2018, min: 400, max: 800, cond: ProductCondition.new },
    { img: 'product-maisto-harley-davidson-fat-boy.png', title: 'Maisto Harley-Davidson Fat Boy 1:18', desc: 'Harley-Davidson Fat Boy Maisto 1:18. Vivid siyah, krom motor, Amerikan cruiser.', cat: 'motosiklet', brandSlug: 'harley-davidson', modelSlug: 'harley-fat-boy', mfgSlug: 'maisto', scale: '1:18', material: 'diecast', year: 2018, min: 350, max: 700, cond: ProductCondition.new },
    { img: 'product-welly-bmw-r1250gs.png', title: 'Welly BMW R1250GS Adventure 1:18', desc: 'BMW R1250GS Adventure Welly 1:18. Rallye mavi-kırmızı-beyaz, macera touring motosiklet.', cat: 'motosiklet', brandSlug: 'bmw', modelSlug: 'bmw-r1250gs', mfgSlug: 'welly', scale: '1:18', material: 'diecast', year: 2019, min: 300, max: 600, cond: ProductCondition.new },
    { img: 'product-maisto-kawasaki-ninja-zx10r.png', title: 'Maisto Kawasaki Ninja ZX-10R 1:18', desc: 'Kawasaki Ninja ZX-10R Maisto 1:18. KRT yeşil-siyah, spor motosiklet.', cat: 'motosiklet', brandSlug: 'kawasaki', modelSlug: 'kawasaki-ninja-zx10r', mfgSlug: 'maisto', scale: '1:18', material: 'diecast', year: 2021, min: 350, max: 700, cond: ProductCondition.new },
    { img: 'product-welly-honda-cbr1000rr.png', title: 'Welly Honda CBR1000RR Repsol 1:18', desc: 'Honda CBR1000RR Fireblade Welly 1:18. Repsol turuncu-kırmızı-mavi, yarış efsanesi.', cat: 'motosiklet', brandSlug: 'honda', modelSlug: 'honda-cbr1000rr', mfgSlug: 'welly', scale: '1:18', material: 'diecast', year: 2020, min: 300, max: 650, cond: ProductCondition.new },

    // ── UÇAK (66-70) ────────────────────────────────────────────────────
    { img: 'product-diecast-p51-mustang.png', title: 'P-51 Mustang WWII Fighter 1:72', desc: 'P-51 Mustang WWII savaş uçağı 1:72 diecast model. Gümüş, kırmızı kuyruk, savaş kuşu klasiği.', cat: 'ucak', scale: '1:72', material: 'diecast', year: 1944, min: 300, max: 600, cond: ProductCondition.new },
    { img: 'product-diecast-spitfire-mk5.png', title: 'Supermarine Spitfire Mk V 1:72', desc: 'Spitfire Mk V 1:72 diecast model. RAF kamuflaj yeşil-kahve, D-Day çizgileri.', cat: 'ucak', scale: '1:72', material: 'diecast', year: 1941, min: 350, max: 700, cond: ProductCondition.new },
    { img: 'product-diecast-f14-tomcat.png', title: 'F-14 Tomcat Navy Fighter 1:72', desc: 'F-14 Tomcat 1:72 diecast model. US Navy gri, VF-84 Jolly Rogers.', cat: 'ucak', scale: '1:72', material: 'diecast', year: 1974, min: 400, max: 800, cond: ProductCondition.new },
    { img: 'product-diecast-red-baron-triplane.png', title: 'Fokker Dr.I Red Baron Triplane 1:72', desc: 'Fokker Dr.I Red Baron triplane 1:72 diecast. Parlak kırmızı, WWI havacılık efsanesi.', cat: 'ucak', scale: '1:72', material: 'diecast', year: 1917, min: 250, max: 500, cond: ProductCondition.new },
    { img: 'product-diecast-boeing-747-lufthansa.png', title: 'Boeing 747 Lufthansa 1:400', desc: 'Boeing 747 Lufthansa renkleri 1:400 diecast. Beyaz-mavi-sarı, göklerin kraliçesi.', cat: 'ucak', scale: '1:400', material: 'diecast', year: 1969, min: 200, max: 450, cond: ProductCondition.new },

    // ── GEMİ (71-75) ────────────────────────────────────────────────────
    { img: 'product-diecast-titanic.png', title: 'RMS Titanic Model Gemi 1:700', desc: 'RMS Titanic 1:700 diecast model. Siyah gövde, beyaz üst güverte, dört baca, denizcilik efsanesi.', cat: 'gemi', scale: '1:700', material: 'diecast', year: 1912, min: 350, max: 700, cond: ProductCondition.new },
    { img: 'product-diecast-uss-enterprise-cv6.png', title: 'USS Enterprise CV-6 1:700', desc: 'WWII uçak gemisi USS Enterprise CV-6 1:700 diecast. Donanma grisi, savaş gemisi detayı.', cat: 'gemi', scale: '1:700', material: 'diecast', year: 1936, min: 400, max: 800, cond: ProductCondition.new },
    { img: 'product-diecast-bismarck-battleship.png', title: 'Bismarck Zırhlısı 1:700', desc: 'Alman zırhlısı Bismarck 1:700 diecast. Koyu gri Baltık kamuflaj, WWII deniz savaşı.', cat: 'gemi', scale: '1:700', material: 'diecast', year: 1939, min: 450, max: 900, cond: ProductCondition.new },
    { img: 'product-diecast-sailboat-clipper.png', title: 'Cutty Sark Yelkenli Gemi 1:350', desc: 'Cutty Sark clipper 1:350 model. Beyaz yelkenler, altın çağ yelkenciliği.', cat: 'gemi', scale: '1:350', material: 'composite', year: 1869, min: 300, max: 600, cond: ProductCondition.new },
    { img: 'product-diecast-submarine-u-boat.png', title: 'Type VII U-Boot Denizaltı 1:350', desc: 'Alman Type VII U-Boot 1:350 diecast denizaltı. Koyu gri, WWII detay.', cat: 'gemi', scale: '1:350', material: 'diecast', year: 1940, min: 350, max: 700, cond: ProductCondition.new },

    // ── TREN (76-80) ────────────────────────────────────────────────────
    { img: 'product-diecast-orient-express-locomotive.png', title: 'Orient Express Buharlı Lokomotif 1:160', desc: 'Orient Express buharlı lokomotif 1:160 diecast. Koyu mavi-altın, lüks demiryolu.', cat: 'tren', scale: '1:160', material: 'diecast', year: 1883, min: 500, max: 1000, cond: ProductCondition.new },
    { img: 'product-diecast-shinkansen-n700.png', title: 'Shinkansen N700 Hızlı Tren 1:160', desc: 'Japon Shinkansen N700 1:160 diecast. Beyaz, mavi şerit, yüksek hızlı tren.', cat: 'tren', scale: '1:160', material: 'diecast', year: 2007, min: 400, max: 800, cond: ProductCondition.new },
    { img: 'product-diecast-union-pacific-big-boy.png', title: 'Union Pacific Big Boy 4014 1:160', desc: 'Union Pacific Big Boy 4014 buharlı lokomotif 1:160. Siyah, gri duman kutusu, Amerikan demiryolu ikonu.', cat: 'tren', scale: '1:160', material: 'diecast', year: 1941, min: 600, max: 1200, cond: ProductCondition.new },
    { img: 'product-diecast-eurostar-e300.png', title: 'Eurostar e300 Yüksek Hızlı Tren 1:160', desc: 'Eurostar e300 1:160 diecast. Beyaz-sarı-mavi, Manş Tüneli.', cat: 'tren', scale: '1:160', material: 'diecast', year: 2015, min: 350, max: 700, cond: ProductCondition.new },
    { img: 'product-diecast-hogwarts-express.png', title: 'Klasik İngiliz Buharlı Lokomotif 1:160', desc: 'Klasik İngiliz GWR tarzı buharlı lokomotif 1:160. Kırmızı, altın detay, nostaljik demiryolu.', cat: 'tren', scale: '1:160', material: 'diecast', year: 1930, min: 450, max: 900, cond: ProductCondition.new },

    // ── SET & DİĞER (81-85) ─────────────────────────────────────────────
    { img: 'product-hot-wheels-5-pack-exotics.png', title: 'Hot Wheels 5\'li Egzotik Spor Araba Seti', desc: 'Hot Wheels 5\'li egzotik araba paketi. Kırmızı, sarı, mavi, yeşil, turuncu; blister ambalaj, hediye seti.', cat: 'set-diger', mfgSlug: 'hot-wheels', scale: '1:64', material: 'diecast', year: 2024, min: 250, max: 500, cond: ProductCondition.new, isSet: true },
    { img: 'product-matchbox-construction-set.png', title: 'Matchbox İnşaat Araçları Seti', desc: 'Matchbox inşaat seti: ekskavatör, damperli kamyon, buldozer. Sarı CAT renkleri, şantiye koleksiyonu.', cat: 'set-diger', mfgSlug: 'matchbox', scale: '1:64', material: 'diecast', year: 2024, min: 200, max: 400, cond: ProductCondition.new, isSet: true },
    { img: 'product-vintage-classics-gift-set.png', title: 'Klasik Otomobil Koleksiyon Seti', desc: '5 adet vintage diecast model: Ford Mustang, Chevrolet Bel Air, Porsche 356, VW Beetle, Mercedes 300SL. Hediye kutusu, koleksiyoner seti.', cat: 'set-diger', scale: '1:64', material: 'diecast', year: 2024, min: 350, max: 700, cond: ProductCondition.new, isSet: true },
    { img: 'product-siku-emergency-vehicles-set.png', title: 'Acil Durum Araçları Seti', desc: 'İtfaiye, ambulans ve polis arabası seti. Klasik acil durum renkleri, kurtarma seti.', cat: 'set-diger', scale: '1:64', material: 'diecast', year: 2024, min: 300, max: 600, cond: ProductCondition.new, isSet: true },
    { img: 'product-racing-legends-gift-set.png', title: 'Motorsport Efsaneleri Seti', desc: 'F1 ve Le Mans efsaneleri: McLaren, Ferrari, Porsche, Ford GT40, Aston Martin. 5 diecast model, yarış koleksiyonu.', cat: 'set-diger', scale: '1:64', material: 'diecast', year: 2024, min: 400, max: 800, cond: ProductCondition.new, isSet: true },
  ];

  const products: any[] = [];
  const sellers = users.filter(u => u.isSeller);

  // Count products per category to guarantee minimum 5 active per category
  const catProductCounts: Record<string, number> = {};
  const catActiveAssigned: Record<string, number> = {};
  for (const d of productData) {
    catProductCounts[d.cat] = (catProductCounts[d.cat] || 0) + 1;
    catActiveAssigned[d.cat] = 0;
  }

  // 70% active, 15% pending, 5% reserved, 5% sold, 5% inactive (for categories with >5 products)
  // NOT: draft, gerçek uygulamada hiçbir akışla oluşmaz (oluşturma → pending), bu yüzden
  // demo veride de üretmiyoruz. inactive (quantity>0) = elle pasife alınmış geçerli durum.
  const statusPool = [
    ...Array(14).fill(ProductStatus.active),
    ...Array(3).fill(ProductStatus.pending),
    ProductStatus.reserved,
    ProductStatus.sold,
    ProductStatus.inactive,
  ];

  for (let i = 0; i < productData.length; i++) {
    const d = productData[i];
    const seller = sellers[i % sellers.length];
    const category = categories.find(c => c.slug === d.cat) || categories[0];
    const brand = d.brandSlug ? brands.find(b => b.slug === d.brandSlug) : null;
    const model = d.modelSlug ? carModels.find(cm => cm.slug === d.modelSlug) : null;
    const mfg = d.mfgSlug ? manufacturers.find(m => m.slug === d.mfgSlug) : null;
    const price = randomPrice(d.min, d.max);

    // Ensure minimum 5 active per category; remaining use status pool
    const catTotal = catProductCounts[d.cat] || 0;
    const catActive = catActiveAssigned[d.cat] || 0;
    let status: ProductStatus;
    if (catActive < 5 || catTotal <= 5) {
      status = ProductStatus.active;
    } else {
      status = statusPool[i % statusPool.length];
    }
    if (status === ProductStatus.active) {
      catActiveAssigned[d.cat] = (catActiveAssigned[d.cat] || 0) + 1;
    }
    const slugBase = d.img.replace('product-', '').replace('.png', '');
    const slug = `${slugBase}-${i}`;

    // Only premium/business sellers can have trade-enabled products (app rule: takas için premium gerekli)
    const isTradeEnabled = canTradeUserIds.has(seller.id) && (i % 3 !== 2);

    const product = await prisma.product.upsert({
      where: { slug },
      create: {
        sellerId: seller.id,
        categoryId: category.id,
        brandId: brand?.id ?? null,
        carModelId: model?.id ?? null,
        manufacturerId: mfg?.id ?? null,
        title: d.title,
        slug,
        description: d.desc,
        price,
        condition: d.cond,
        status,
        isTradeEnabled,
        isSet: d.isSet ?? false,
        isLimited: d.isLimited ?? false,
        isPreorder: d.isPreorder ?? false,
        releaseDate: new Date(d.year, 0, 1),
        viewCount: Math.floor(Math.random() * 500) + 10,
        quantity: 1,
        createdAt: randomPastDate(60),
      },
      update: {
        sellerId: seller.id,
        categoryId: category.id,
        brandId: brand?.id ?? null,
        carModelId: model?.id ?? null,
        title: d.title,
        description: d.desc,
        price,
        condition: d.cond,
        status,
        isTradeEnabled,
        isSet: d.isSet ?? false,
        isLimited: d.isLimited ?? false,
        isPreorder: d.isPreorder ?? false,
        releaseDate: new Date(d.year, 0, 1),
        viewCount: Math.floor(Math.random() * 500) + 10,
        quantity: 1,
      },
    });

    // Assign scale + material + vehicle_type attributes (upsert için önce mevcut attribute'ları sil)
    await prisma.productAttribute.deleteMany({ where: { productId: product.id } });
    const sAttr = scaleAttrs[d.scale];
    const mAttr = materialAttrs[d.material];
    const vehicleTypeSlug = catToVehicleTypeSlug[d.cat];
    const vtAttr = vehicleTypeSlug ? vehicleTypeAttrs[vehicleTypeSlug] : null;
    if (sAttr) {
      try { await prisma.productAttribute.create({ data: { productId: product.id, attributeId: sAttr.id } }); } catch {}
    }
    if (mAttr) {
      try { await prisma.productAttribute.create({ data: { productId: product.id, attributeId: mAttr.id } }); } catch {}
    }
    if (vtAttr) {
      try { await prisma.productAttribute.create({ data: { productId: product.id, attributeId: vtAttr.id } }); } catch {}
    }

    products.push(product);
  }

  console.log(`✅ Created ${products.length} products (with brands, models, attributes)`);

  // ==========================================================================
  // 10b. İndirim uygula (rastgele ~15 ürüne %10–30 indirim; oldPrice > price)
  // ==========================================================================
  const discountCount = Math.min(15, Math.floor(products.length * 0.2));
  const indicesToDiscount = new Set<number>();
  while (indicesToDiscount.size < discountCount) {
    indicesToDiscount.add(Math.floor(Math.random() * products.length));
  }
  const saleStart = new Date();
  const saleEnd = new Date(saleStart.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 hafta
  for (const idx of indicesToDiscount) {
    const p = products[idx];
    const originalPrice = Number(p.price);
    const discountPct = Math.floor(Math.random() * (30 - 10 + 1) + 10);
    const salePrice = Math.round((originalPrice * (100 - discountPct) / 100) * 100) / 100;
    if (salePrice >= originalPrice) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        oldPrice: originalPrice,
        price: salePrice,
        saleStartDate: saleStart,
        saleEndDate: saleEnd,
      },
    });
    products[idx] = { ...p, price: salePrice, oldPrice: originalPrice };
  }
  console.log(`✅ ${discountCount} ürüne indirim uygulandı (%10–30)`);

  // ==========================================================================
  // 11. Create Product Images (upload to S3 or use placeholder)
  // ==========================================================================
  console.log('Creating product images...');

  // Initialize StorageService
  const storageService = initStorageService();
  let isStorageAvailable = false;

  // Initialize storage service if available
  if (!storageService) {
    throw new Error('StorageService not initialized - cannot seed product images. Ensure AWS credentials are configured.');
  }
  await storageService.onModuleInit();
  isStorageAvailable = storageService.isStorageAvailable();
  if (!isStorageAvailable) {
    throw new Error('S3 storage not available - cannot seed product images. Ensure S3 bucket is accessible.');
  }
  if (!sharp) {
    throw new Error('sharp not installed - run pnpm add sharp in apps/api');
  }
  console.log('✅ S3 storage available, uploading product images...');

  // Delete all existing product images first (for upsert scenario)
  const productIds = products.map(p => p.id);
  await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } });

  // Prepare all image upload tasks - fail loudly on any error
  const imageUploadTasks = products.map(async (product, i) => {
    const imgFile = productData[i].img;
    const imgPath = path.join(PHOTOS_ROOT, 'products', imgFile);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Product image file not found: ${imgPath}`);
    }
    const { cardKey, detailKey } = await uploadProductImageVariants(storageService, imgPath, product.id);
    return {
      productId: product.id,
      cardKey,
      detailKey,
      sortOrder: 0,
    };
  });

  const imageData = await Promise.all(imageUploadTasks);
  await prisma.productImage.createMany({
    data: imageData,
  });
  console.log(`✅ Created product images (${imageData.length} S3 uploads)`);

  // ==========================================================================
  // 12. Create Collections (one per category + thematic)
  // ==========================================================================
  console.log('Creating collections...');

  const collectionDefs = [
    { slug: 'best-jdm', name: 'En İyi JDM Modelleri', desc: 'Japon spor arabalarından oluşan özel koleksiyonum', catSlug: 'araba', coverFile: 'collection-best-jdm.png', user: users[3], featured: true },
    { slug: 'vintage-treasures', name: 'Vintage Hazinelerim', desc: 'Antika ve nadir diecast modeller', catSlug: 'araba', coverFile: 'collection-vintage-treasures.png', user: users[5], featured: true },
    { slug: 'premium-118', name: 'Premium 1:18 Vitrinim', desc: 'En değerli 1:18 ölçekli modellerim', catSlug: 'araba', coverFile: 'collection-premium-118.png', user: users[7], featured: true },
    { slug: 'muscle-heaven', name: 'Muscle Car Cenneti', desc: 'Amerikan kas arabaları koleksiyonu', catSlug: 'araba', coverFile: 'collection-muscle-heaven.png', user: users[4], featured: false },
    { slug: 'hw-treasure-hunt', name: 'Hot Wheels Treasure Hunt', desc: 'Super ve Regular Treasure Hunt modelleri', catSlug: 'araba', coverFile: 'collection-hw-treasure-hunt.png', user: users[6], featured: false },
    { slug: 'trade-list', name: 'Takas Listesi', desc: 'Takas için açık modellerim', catSlug: null, coverFile: 'collection-trade-list.png', user: users[9], featured: false },
    { slug: 'offroad-beasts', name: 'Arazi Canavarları', desc: 'SUV ve kamyon modelleri koleksiyonu', catSlug: 'kamyon', coverFile: 'collection-offroad-beasts.png', user: users[3], featured: false },
    { slug: 'f1-grid', name: 'F1 Grid Koleksiyonu', desc: 'Farklı takımlardan Formula 1 modelleri', catSlug: 'motorspor', coverFile: 'collection-f1-grid.png', user: users[4], featured: true },
    { slug: 'two-wheels', name: 'İki Teker Tutkusu', desc: 'Motosiklet modelleri koleksiyonu', catSlug: 'motosiklet', coverFile: 'collection-two-wheels.png', user: users[5], featured: false },
    { slug: 'wings-of-war', name: 'Savaş Kuşları', desc: 'WWII ve modern savaş uçağı modelleri', catSlug: 'ucak', coverFile: 'collection-wings-of-war.png', user: users[6], featured: false },
    { slug: 'naval-fleet', name: 'Donanma Filosu', desc: 'Savaş gemisi ve denizaltı modelleri', catSlug: 'gemi', coverFile: 'collection-naval-fleet.png', user: users[7], featured: false },
    { slug: 'rail-legends', name: 'Rayların Efsaneleri', desc: 'Tren ve lokomotif modelleri', catSlug: 'tren', coverFile: 'collection-rail-legends.png', user: users[8], featured: false },
    { slug: 'starter-bundle', name: 'Başlangıç Paketi', desc: 'Yeni koleksiyoncular için ideal set ve paketler', catSlug: 'set-diger', coverFile: 'collection-starter-bundle.png', user: users[9], featured: false },
  ];

  const collections: any[] = [];
  for (const cd of collectionDefs) {
    const catId = cd.catSlug ? categories.find(c => c.slug === cd.catSlug)?.id ?? null : null;

    const coverPath = path.join(PHOTOS_ROOT, 'collections', cd.coverFile);
    if (!fs.existsSync(coverPath)) {
      throw new Error(`Collection cover file not found: ${coverPath}`);
    }
    const coverKey = await uploadCollectionCover(storageService!, coverPath);

    const existingBySlug = await prisma.collection.findFirst({
      where: { slug: cd.slug, userId: cd.user.id },
    });
    const collId = existingBySlug?.id ?? randomUUID();

    const collection = await prisma.collection.upsert({
      where: { id: collId },
      update: { coverImageKey: coverKey, categoryId: catId },
      create: {
        id: collId,
        userId: cd.user.id,
        categoryId: catId,
        name: cd.name,
        slug: cd.slug,
        description: cd.desc,
        coverImageKey: coverKey,
        isPublic: true,
        isFeatured: cd.featured,
        viewCount: Math.floor(Math.random() * 200) + 20,
        likeCount: Math.floor(Math.random() * 50) + 5,
      },
    });
    collections.push(collection);
  }

  // Assign products to matching collections
  for (const coll of collections) {
    const collDef = collectionDefs.find(d => d.slug === coll.slug)!;
    const matchingProducts = collDef.catSlug
      ? products.filter((_, idx) => productData[idx].cat === collDef.catSlug)
      : products.filter(() => Math.random() > 0.7);
    const chosen = matchingProducts.sort(() => 0.5 - Math.random()).slice(0, Math.min(8, matchingProducts.length));
    for (let i = 0; i < chosen.length; i++) {
      try {
        await prisma.collectionItem.create({
          data: { collectionId: coll.id, productId: chosen[i].id, sortOrder: i, isFeatured: i === 0 },
        });
      } catch {}
    }
  }

  console.log(`✅ Created ${collections.length} collections (with covers and category links)`);

  // ==========================================================================
  // 13. Create Wishlist Items
  // ==========================================================================
  console.log('Creating wishlist items...');

  for (let i = 3; i < users.length; i++) {
    const wishlist = await prisma.wishlist.findUnique({ where: { userId: users[i].id } });
    if (wishlist) {
      const itemCount = Math.floor(Math.random() * 10) + 1;
      const shuffled = products.filter(p => p.sellerId !== users[i].id).sort(() => 0.5 - Math.random());
      for (let j = 0; j < Math.min(itemCount, shuffled.length); j++) {
        try {
          await prisma.wishlistItem.create({
            data: {
              wishlistId: wishlist.id,
              productId: shuffled[j].id,
            },
          });
        } catch (e) {
          // Ignore duplicates
        }
      }
    }
  }

  console.log(`✅ Created wishlist items`);

  // ==========================================================================
  // 14. Create Offers (30+ offers)
  // ==========================================================================
  console.log('Creating offers...');

  const activeProducts = products.filter(p => p.status === ProductStatus.active);
  const offers: any[] = [];

  for (let i = 0; i < 35; i++) {
    const product = activeProducts[i % activeProducts.length];
    const buyers = users.filter(u => u.id !== product.sellerId && u.isSeller !== false);
    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const offerAmount = Number(product.price) * (0.6 + Math.random() * 0.35); // 60-95% of price
    const statuses = [OfferStatus.pending, OfferStatus.pending, OfferStatus.accepted, OfferStatus.rejected, OfferStatus.expired];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    try {
      const offer = await prisma.offer.create({
        data: {
          productId: product.id,
          buyerId: buyer.id,
          sellerId: product.sellerId,
          amount: Math.round(offerAmount * 100) / 100,
          status: status,
          expiresAt: status === OfferStatus.pending ? randomFutureDate(2) : randomPastDate(5),
          createdAt: randomPastDate(10),
        },
      });
      offers.push(offer);
    } catch (e) {
      // Ignore errors
    }
  }

  console.log(`✅ Created ${offers.length} offers`);

  // ==========================================================================
  // 15. Create Orders (25+ orders)
  // ==========================================================================
  console.log('Creating orders...');

  const orders: any[] = [];
  const orderStatuses = [OrderStatus.pending_payment, OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped, OrderStatus.delivered, OrderStatus.completed];

  for (let i = 0; i < 30; i++) {
    const product = activeProducts[i % activeProducts.length];
    const buyers = users.filter(u => u.id !== product.sellerId);
    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
    // Invariant (order.service checkout ile aynı): totalAmount = subtotal + shipping + buyerFee
    const subtotal = Number(product.price);
    const shippingCost = 30;
    const totalAmount = subtotal + shippingCost;
    const commission = subtotal * 0.05;
    const buyerAddress = addresses.find(a => a.userId === buyer.id);

    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          buyerId: buyer.id,
          sellerId: product.sellerId,
          productId: product.id,
          totalAmount: totalAmount,
          subtotal: subtotal,
          shippingCost: shippingCost,
          commissionAmount: commission,
          status: status,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: buyerAddress ? {
            fullName: buyerAddress.fullName,
            phone: buyerAddress.phone,
            city: buyerAddress.city,
            district: buyerAddress.district,
            address: buyerAddress.address,
          } : undefined,
          createdAt: randomPastDate(30),
        },
      });
      orders.push(order);
    } catch (e) {
      // Ignore errors
    }
  }

  console.log(`✅ Created ${orders.length} orders`);

  // ==========================================================================
  // 16. Create Payments for Orders
  // ==========================================================================
  console.log('Creating payments...');

  const paidOrders = orders.filter(o => o.status !== OrderStatus.pending_payment);
  for (const order of paidOrders) {
    try {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'paytr',
          providerPaymentId: `PAY-${randomUUID().substring(0, 8)}`,
          amount: order.totalAmount,
          currency: 'TRY',
          status: PaymentStatus.completed,
          paidAt: new Date(order.createdAt.getTime() + 3600000), // 1 hour after order
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log(`✅ Created payments`);

  // ==========================================================================
  // 17. Create Shipments for Shipped Orders
  // ==========================================================================
  console.log('Creating shipments...');

  const shippedOrders = orders.filter(o => [OrderStatus.shipped, OrderStatus.delivered, OrderStatus.completed].includes(o.status));
  for (const order of shippedOrders) {
    const carrier = 'surat';
    const shipmentStatus = order.status === OrderStatus.shipped ? ShipmentStatus.in_transit : ShipmentStatus.delivered;
    
    try {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          provider: carrier,
          trackingNumber: `${carrier.toUpperCase()}${Math.random().toString().substring(2, 14)}`,
          trackingUrl: `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=`,
          status: shipmentStatus,
          shippedAt: new Date(order.createdAt.getTime() + 86400000), // 1 day after order
          deliveredAt: shipmentStatus === ShipmentStatus.delivered ? new Date(order.createdAt.getTime() + 259200000) : null, // 3 days after
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log(`✅ Created shipments`);

  // ==========================================================================
  // 17.5 Create Refund Requests + Refunded Payments
  //   Admin "İade Talepleri" (RefundRequest — tüm statüler) ve
  //   "İade Geçmişi" (Payment.status = refunded) sayfaları için veri.
  // ==========================================================================
  console.log('Creating refund requests & refunds...');

  // Benzersiz iade numarası — runtime RFD-XXXXXXXXXX formatıyla uyumlu (dev/seed).
  const generateRefundNumber = () =>
    `RFD-${Array.from({ length: 10 }, () => REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]).join('')}`;

  const daysAgoDate = (days: number) => new Date(Date.now() - days * 86400000);

  // Statüye göre RefundRequest alanlarını üretir (karar / iade kargosu / para iadesi).
  const buildRefundFields = (
    status: RefundRequestStatus,
    sellerId: string,
    createdAt: Date,
  ): Record<string, any> => {
    const plus = (days: number) => new Date(createdAt.getTime() + days * 86400000);
    const trackingNo = `RFD${Math.random().toString().substring(2, 14)}`;
    const approve = 'Talebinizi inceledik, iade onaylandı. İade kargosu hazırlanıyor.';
    const reject = 'Talebiniz tarafımızca uygun bulunmadı, ürün açıklamayla uyumlu.';

    const decided = {
      sellerResponse: approve,
      decidedBy: sellerId,
      decidedAt: plus(0.5),
      returnShippingPayer: ReturnShippingPayer.seller,
    };
    const returnOpened = {
      ...decided,
      returnProvider: 'surat',
      returnTrackingNumber: trackingNo,
      returnCreatedAt: plus(1),
    };

    switch (status) {
      case RefundRequestStatus.pending_review:
        return {}; // satıcı henüz yanıt vermedi
      case RefundRequestStatus.approved:
      case RefundRequestStatus.wait_for_delivery:
        return decided;
      case RefundRequestStatus.return_shipment_open:
        return { ...returnOpened, returnStatus: ShipmentStatus.label_created };
      case RefundRequestStatus.return_in_transit:
        return {
          ...returnOpened,
          returnShippedAt: plus(1.5),
          returnStatus: ShipmentStatus.in_transit,
        };
      case RefundRequestStatus.return_delivered:
        return {
          ...returnOpened,
          returnShippedAt: plus(1.5),
          returnDeliveredAt: plus(3),
          returnStatus: ShipmentStatus.delivered,
        };
      case RefundRequestStatus.disputed:
        return { sellerResponse: reject }; // admin kararı bekleniyor (decidedBy yok)
      case RefundRequestStatus.rejected:
        return { sellerResponse: reject, decidedBy: sellerId, decidedAt: plus(0.5) };
      case RefundRequestStatus.cancelled:
        return {}; // alıcı talebi iptal etti
      case RefundRequestStatus.refunded:
        return {
          ...returnOpened,
          returnShippedAt: plus(1.5),
          returnDeliveredAt: plus(3),
          returnStatus: ShipmentStatus.returned,
          refundedAt: plus(4),
          providerRefundId: `REFUND-${randomUUID().substring(0, 8)}`,
        };
      default:
        return {};
    }
  };

  // Her RefundRequestStatus için en az bir senaryo; refunded'lar Payment.refunded eşleniğiyle.
  const refundScenarios: {
    status: RefundRequestStatus;
    reason: RefundReason;
    description: string;
    daysAgo: number;
    orderStatus: OrderStatus;
  }[] = [
    { status: RefundRequestStatus.pending_review, reason: RefundReason.not_as_described, description: 'Ürün açıklamadakinden farklı, beklediğim gibi değil.', daysAgo: 1, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.pending_review, reason: RefundReason.damaged, description: 'Kargo sırasında hasar görmüş, kutusu ezilmiş.', daysAgo: 2, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.approved, reason: RefundReason.wrong_item, description: 'Yanlış ürün gönderilmiş, farklı bir model geldi.', daysAgo: 4, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.wait_for_delivery, reason: RefundReason.changed_mind, description: 'Fikrim değişti, ürünü iade etmek istiyorum.', daysAgo: 5, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.return_shipment_open, reason: RefundReason.missing_parts, description: 'Eksik parça var, set tam değil.', daysAgo: 6, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.return_in_transit, reason: RefundReason.not_as_described, description: 'Renk fotoğraftakinden çok farklı çıktı.', daysAgo: 8, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.return_delivered, reason: RefundReason.damaged, description: 'Ürün arızalı çıktı, çalışmıyor.', daysAgo: 10, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.disputed, reason: RefundReason.counterfeit, description: 'Ürünün orijinal olduğundan şüpheliyim, admin incelemesi istiyorum.', daysAgo: 7, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.rejected, reason: RefundReason.changed_mind, description: 'Vazgeçtim ama satıcı iade talebini kabul etmedi.', daysAgo: 12, orderStatus: OrderStatus.completed },
    { status: RefundRequestStatus.cancelled, reason: RefundReason.other, description: 'Talebi yanlışlıkla açtım, iptal ediyorum.', daysAgo: 9, orderStatus: OrderStatus.delivered },
    { status: RefundRequestStatus.refunded, reason: RefundReason.not_as_described, description: 'Ürün açıklamayla uyuşmuyordu, iade tamamlandı.', daysAgo: 14, orderStatus: OrderStatus.completed },
    { status: RefundRequestStatus.refunded, reason: RefundReason.damaged, description: 'Hasarlı ürün, ücret iadesi yapıldı.', daysAgo: 18, orderStatus: OrderStatus.completed },
    { status: RefundRequestStatus.refunded, reason: RefundReason.lost_in_transit, description: 'Kargo kayboldu, ödeme iade edildi.', daysAgo: 22, orderStatus: OrderStatus.completed },
  ];

  const refundRequests: any[] = [];
  let refundedPaymentCount = 0;

  for (let i = 0; i < refundScenarios.length; i++) {
    const sc = refundScenarios[i];
    const product = activeProducts[i % activeProducts.length];
    if (!product) continue;
    const candidateBuyers = users.filter(u => u.id !== product.sellerId);
    if (candidateBuyers.length === 0) continue;
    const buyer = candidateBuyers[i % candidateBuyers.length];
    const buyerAddress = addresses.find(a => a.userId === buyer.id);

    const subtotal = Number(product.price);
    const shippingCost = 30;
    const totalAmount = subtotal + shippingCost;
    const commission = subtotal * 0.05;
    const createdAt = daysAgoDate(sc.daysAgo);
    const isCompleted = sc.orderStatus === OrderStatus.completed;
    const isRefunded = sc.status === RefundRequestStatus.refunded;

    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          buyerId: buyer.id,
          sellerId: product.sellerId,
          productId: product.id,
          totalAmount,
          subtotal,
          shippingCost,
          commissionAmount: commission,
          status: sc.orderStatus,
          paymentExpiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
          deliveredAt: new Date(createdAt.getTime() + 3 * 86400000),
          completedAt: isCompleted ? new Date(createdAt.getTime() + 5 * 86400000) : null,
          shippingAddress: buyerAddress ? {
            fullName: buyerAddress.fullName,
            phone: buyerAddress.phone,
            city: buyerAddress.city,
            district: buyerAddress.district,
            address: buyerAddress.address,
          } : undefined,
          createdAt,
        },
      });

      // İade tamamlandıysa Payment.refunded → "İade Geçmişi" sayfasını besler.
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'paytr',
          providerPaymentId: `PAY-${randomUUID().substring(0, 8)}`,
          amount: totalAmount,
          currency: 'TRY',
          status: isRefunded ? PaymentStatus.refunded : PaymentStatus.completed,
          paidAt: new Date(createdAt.getTime() + 3600000),
          // İade geçmişi updatedAt'i "iade tarihi" olarak gösterir.
          updatedAt: isRefunded ? new Date(createdAt.getTime() + 4 * 86400000) : undefined,
        },
      });
      if (isRefunded) refundedPaymentCount++;

      // Teslim edilmiş kargo (detay/iade akışı tutarlılığı için).
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          provider: 'surat',
          trackingNumber: `SURAT${Math.random().toString().substring(2, 14)}`,
          trackingUrl: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=',
          status: ShipmentStatus.delivered,
          shippedAt: new Date(createdAt.getTime() + 86400000),
          deliveredAt: new Date(createdAt.getTime() + 3 * 86400000),
        },
      });

      const refundRequest = await prisma.refundRequest.create({
        data: {
          refundNumber: generateRefundNumber(),
          orderId: order.id,
          requesterId: buyer.id,
          reason: sc.reason,
          description: sc.description,
          amount: totalAmount,
          status: sc.status,
          createdAt,
          ...buildRefundFields(sc.status, product.sellerId, createdAt),
        },
      });
      refundRequests.push(refundRequest);
    } catch (e: any) {
      console.error(`⚠️ Refund scenario ${sc.status} failed:`, e?.message);
    }
  }

  console.log(`✅ Created ${refundRequests.length} refund requests (${refundedPaymentCount} refunded payments)`);

  // ==========================================================================
  // 18. Create Trades (15+ trades in various states)
  // ==========================================================================
  console.log('Creating trades...');

  const tradeableProducts = products.filter(p => p.isTradeEnabled && p.status === ProductStatus.active);
  const tradeStatuses = [TradeStatus.pending, TradeStatus.pending, TradeStatus.accepted, TradeStatus.initiator_shipped, TradeStatus.both_shipped, TradeStatus.completed, TradeStatus.rejected];
  const trades: any[] = [];

  for (let i = 0; i < 18; i++) {
    const initiatorProducts = tradeableProducts.filter((_, idx) => idx % 3 === i % 3);
    const receiverProducts = tradeableProducts.filter((_, idx) => idx % 3 !== i % 3);
    
    if (initiatorProducts.length === 0 || receiverProducts.length === 0) continue;
    
    const initiatorProduct = initiatorProducts[i % initiatorProducts.length];
    const receiverProduct = receiverProducts[i % receiverProducts.length];
    
    if (initiatorProduct.sellerId === receiverProduct.sellerId) continue;
    
    const status = tradeStatuses[Math.floor(Math.random() * tradeStatuses.length)];
    const valueDiff = Math.abs(Number(initiatorProduct.price) - Number(receiverProduct.price));
    const hasCash = valueDiff > 100;

    try {
      const trade = await prisma.trade.create({
        data: {
          tradeNumber: generateTradeNumber(),
          initiatorId: initiatorProduct.sellerId,
          receiverId: receiverProduct.sellerId,
          status: status,
          cashAmount: hasCash ? valueDiff * 0.5 : null,
          cashPayerId: hasCash ? (Number(initiatorProduct.price) < Number(receiverProduct.price) ? initiatorProduct.sellerId : receiverProduct.sellerId) : null,
          initiatorMessage: `Merhaba! ${receiverProduct.title} için ${initiatorProduct.title} modelimi takas etmek istiyorum. İlgilenirseniz dönüş yapabilir misiniz?`,
          responseDeadline: randomFutureDate(3),
          acceptedAt: status !== TradeStatus.pending && status !== TradeStatus.rejected ? randomPastDate(5) : null,
          completedAt: status === TradeStatus.completed ? randomPastDate(2) : null,
          createdAt: randomPastDate(10),
        },
      });

      // Create trade items
      await prisma.tradeItem.create({
        data: {
          tradeId: trade.id,
          productId: initiatorProduct.id,
          side: 'initiator',
          valueAtTrade: initiatorProduct.price,
        },
      });

      await prisma.tradeItem.create({
        data: {
          tradeId: trade.id,
          productId: receiverProduct.id,
          side: 'receiver',
          valueAtTrade: receiverProduct.price,
        },
      });

      trades.push(trade);
    } catch (e) {
      // Ignore errors
    }
  }

  console.log(`✅ Created ${trades.length} trades`);

  // ==========================================================================
  // 18b. Create Trade Shipments — populates the "Takas Kargoları" admin page
  // Mirrors the escrow legs the real flow produces (admin.service.ts):
  //   to_warehouse   : user → Tarodan deposu (recipientType 'warehouse')
  //   from_warehouse : depo → kullanıcı (shipper = admin, recipientType 'user')
  //   return         : depo → asıl sahip (iade)
  // ==========================================================================
  console.log('Creating trade shipments...');

  const tsCarriers = ['surat'];
  const tsTracking = (carrier: string) =>
    `${carrier.toUpperCase()}${Math.random().toString().substring(2, 14)}`;
  const tsAddrOf = (userId: string) =>
    addresses.find((a) => a.userId === userId)?.id ?? null;

  // Statuses that imply the parcel has physically moved (→ shippedAt set).
  const tsMoved = new Set<ShipmentStatus>([
    ShipmentStatus.picked_up,
    ShipmentStatus.in_transit,
    ShipmentStatus.at_delivery_branch,
    ShipmentStatus.out_for_delivery,
    ShipmentStatus.delivered,
    ShipmentStatus.failed,
    ShipmentStatus.return_in_progress,
    ShipmentStatus.returned,
  ]);
  const tsDelivered = new Set<ShipmentStatus>([
    ShipmentStatus.delivered,
    ShipmentStatus.returned,
  ]);

  // Build a single shipment payload with status-appropriate dates / tracking.
  const tsBuild = (
    trade: any,
    idx: number,
    opts: {
      shipperId: string;
      status: ShipmentStatus;
      leg: 'to_warehouse' | 'from_warehouse' | 'return';
      recipientUserId: string | null;
    },
  ) => {
    const carrier = tsCarriers[idx % tsCarriers.length];
    const fromWarehouse = opts.leg !== 'to_warehouse';
    const shippedAt = tsMoved.has(opts.status) ? randomPastDate(8) : null;
    const deliveredAt =
      tsDelivered.has(opts.status) && shippedAt
        ? new Date(shippedAt.getTime() + 2 * 86400000)
        : null;
    return {
      tradeId: trade.id,
      shipperId: opts.shipperId,
      fromAddressId: fromWarehouse ? warehouseAddress.id : tsAddrOf(opts.shipperId),
      carrier,
      // pending = etiket henüz yok; sonraki tüm durumlarda takip no mevcut.
      trackingNumber:
        opts.status === ShipmentStatus.pending ? null : tsTracking(carrier),
      status: opts.status,
      shippedAt,
      deliveredAt,
      confirmedAt:
        fromWarehouse && opts.status === ShipmentStatus.delivered && deliveredAt
          ? new Date(deliveredAt.getTime() + 86400000)
          : null,
      leg: opts.leg,
      recipientType: fromWarehouse ? 'user' : 'warehouse',
      recipientUserId: opts.recipientUserId,
    };
  };

  const tsData: any[] = [];

  // Pass A — realistic shipments derived from each trade's status.
  trades.forEach((trade, idx) => {
    switch (trade.status) {
      case TradeStatus.accepted:
        // Etiketler oluştu, taraflar henüz kargoya vermedi.
        tsData.push(
          tsBuild(trade, idx, { shipperId: trade.initiatorId, status: ShipmentStatus.label_created, leg: 'to_warehouse', recipientUserId: null }),
          tsBuild(trade, idx, { shipperId: trade.receiverId, status: ShipmentStatus.label_created, leg: 'to_warehouse', recipientUserId: null }),
        );
        break;
      case TradeStatus.initiator_shipped:
        // Başlatan depoya yolladı, alıcı henüz beklemede.
        tsData.push(
          tsBuild(trade, idx, { shipperId: trade.initiatorId, status: ShipmentStatus.in_transit, leg: 'to_warehouse', recipientUserId: null }),
          tsBuild(trade, idx, { shipperId: trade.receiverId, status: ShipmentStatus.pending, leg: 'to_warehouse', recipientUserId: null }),
        );
        break;
      case TradeStatus.both_shipped:
        // Her iki ürün de depoya ulaştı.
        tsData.push(
          tsBuild(trade, idx, { shipperId: trade.initiatorId, status: ShipmentStatus.delivered, leg: 'to_warehouse', recipientUserId: null }),
          tsBuild(trade, idx, { shipperId: trade.receiverId, status: ShipmentStatus.delivered, leg: 'to_warehouse', recipientUserId: null }),
        );
        break;
      case TradeStatus.completed:
        // Tam yaşam döngüsü: depoya geliş + alıcılara teslim.
        tsData.push(
          tsBuild(trade, idx, { shipperId: trade.initiatorId, status: ShipmentStatus.delivered, leg: 'to_warehouse', recipientUserId: null }),
          tsBuild(trade, idx, { shipperId: trade.receiverId, status: ShipmentStatus.delivered, leg: 'to_warehouse', recipientUserId: null }),
          tsBuild(trade, idx, { shipperId: superAdmin.id, status: ShipmentStatus.delivered, leg: 'from_warehouse', recipientUserId: trade.initiatorId }),
          tsBuild(trade, idx, { shipperId: superAdmin.id, status: ShipmentStatus.delivered, leg: 'from_warehouse', recipientUserId: trade.receiverId }),
        );
        break;
      default:
        // pending / rejected → henüz kargo yok.
        break;
    }
  });

  // Pass B — backfill so every status + leg appears and all admin filters return rows.
  if (trades.length > 0) {
    const tsBackfill: Array<{ status: ShipmentStatus; leg: 'to_warehouse' | 'from_warehouse' | 'return' }> = [
      { status: ShipmentStatus.picked_up, leg: 'to_warehouse' },
      { status: ShipmentStatus.at_delivery_branch, leg: 'from_warehouse' },
      { status: ShipmentStatus.out_for_delivery, leg: 'from_warehouse' },
      { status: ShipmentStatus.failed, leg: 'from_warehouse' },
      { status: ShipmentStatus.return_in_progress, leg: 'return' },
      { status: ShipmentStatus.returned, leg: 'return' },
      { status: ShipmentStatus.cancelled, leg: 'to_warehouse' },
    ];
    tsBackfill.forEach((b, k) => {
      const trade = trades[k % trades.length];
      const warehouseLeg = b.leg === 'to_warehouse';
      tsData.push(
        tsBuild(trade, k, {
          shipperId: warehouseLeg ? trade.initiatorId : superAdmin.id,
          status: b.status,
          leg: b.leg,
          recipientUserId: warehouseLeg ? null : trade.receiverId,
        }),
      );
    });
  }

  let tsCreated = 0;
  for (const data of tsData) {
    try {
      await prisma.tradeShipment.create({ data });
      tsCreated++;
    } catch (e) {
      // Ignore individual failures (e.g. missing optional refs)
    }
  }

  console.log(`✅ Created ${tsCreated} trade shipments`);

  // ==========================================================================
  // 19. Create Messages/Conversations
  // ==========================================================================
  console.log('Creating message threads...');

  const conversations: any[] = [];
  for (let i = 0; i < 20; i++) {
    const user1 = users[3 + (i % (users.length - 3))];
    const user2 = users[3 + ((i + 5) % (users.length - 3))];
    if (user1.id === user2.id) continue;

    const product = activeProducts[i % activeProducts.length];
    
    try {
      const thread = await prisma.messageThread.create({
        data: {
          participant1Id: user1.id,
          participant2Id: user2.id,
          productId: product.id,
          lastMessageAt: randomPastDate(5),
        },
      });

      // Create messages in the thread
      const messages = [
        { sender: user1.id, receiver: user2.id, content: `Merhaba, ${product.title} hala satılık mı?` },
        { sender: user2.id, receiver: user1.id, content: 'Evet, hala satılık. İlgileniyorsanız detaylı fotoğraf gönderebilirim.' },
        { sender: user1.id, receiver: user2.id, content: 'Evet lütfen, bir de fiyatta pazarlık payı var mı?' },
        { sender: user2.id, receiver: user1.id, content: 'Tabii, teklif yapabilirsiniz. Fotoğrafları da hemen gönderiyorum.' },
      ];

      for (let j = 0; j < messages.length; j++) {
        await prisma.message.create({
          data: {
            threadId: thread.id,
            senderId: messages[j].sender,
            receiverId: messages[j].receiver,
            content: messages[j].content,
            status: MessageStatus.sent,
            createdAt: new Date(thread.lastMessageAt.getTime() - (messages.length - j) * 3600000),
          },
        });
      }

      conversations.push(thread);
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log(`✅ Created ${conversations.length} conversations`);

  // ==========================================================================
  // 20. Create Ratings
  // ==========================================================================
  console.log('Creating ratings...');

  const completedOrders = orders.filter(o => o.status === OrderStatus.completed);
  for (const order of completedOrders) {
    try {
      // Buyer rates seller
      await prisma.rating.create({
        data: {
          giverId: order.buyerId,
          receiverId: order.sellerId,
          orderId: order.id,
          score: Math.floor(Math.random() * 2) + 4, // 4-5 stars
          comment: ['Harika satıcı!', 'Çok hızlı kargo', 'Ürün tam açıklandığı gibi', 'Teşekkürler, çok memnun kaldım'][Math.floor(Math.random() * 4)],
          status: RatingStatus.approved,
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Create product ratings for many completed orders (3-5 stars, varied)
  const maxProductRatings = Math.min(completedOrders.length, 100);
  for (let i = 0; i < maxProductRatings; i++) {
    const order = completedOrders[i % completedOrders.length];
    if (!order) continue;

    const possibleScores = [3, 4, 5];
    const score = possibleScores[Math.floor(Math.random() * possibleScores.length)];
    const titles = ['Mükemmel!', 'Harika ürün', 'Beklentilerimi karşıladı', 'Çok kaliteli', 'Fena değil'];

    try {
      await prisma.productRating.create({
        data: {
          productId: order.productId,
          userId: order.buyerId,
          orderId: order.id,
          score,
          title: titles[Math.floor(Math.random() * titles.length)],
          review: 'Ürün açıklamaya uygun, paketleme çok iyi yapılmış. Satıcıya teşekkürler.',
          isVerifiedPurchase: true,
          helpfulCount: Math.floor(Math.random() * 20),
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Update Product.averageRating and Product.ratingCount for all products with ratings
  const productsWithRatings = await prisma.productRating.groupBy({
    by: ['productId'],
    _avg: { score: true },
    _count: true,
  });
  for (const row of productsWithRatings) {
    await prisma.product.update({
      where: { id: row.productId },
      data: {
        averageRating: row._avg.score ?? undefined,
        ratingCount: row._count,
      },
    });
  }

  console.log(`✅ Created ratings`);

  // ==========================================================================
  // 21. Create Support Tickets
  // ==========================================================================
  console.log('Creating support tickets...');

  // Senaryo tabanlı ticket şablonları — her kategori ve durumdan gerçekçi örnek
  const ticketScenarios: Array<{
    cat: TicketCategory;
    subj: string;
    pri: TicketPriority;
    status: TicketStatus;
    messages: Array<{ fromAdmin: boolean; content: string; isInternal?: boolean }>;
  }> = [
    {
      cat: TicketCategory.payment,
      subj: 'Ödeme başarısız oldu ama kartımdan para çekildi',
      pri: TicketPriority.urgent,
      status: TicketStatus.in_progress,
      messages: [
        { fromAdmin: false, content: 'Merhaba, sipariş #ORD-00123 için ödeme yapmaya çalıştım. Banka hesabımdan 450 TL çekildi ancak sipariş "Ödeme Bekleniyor" durumunda kalmaya devam ediyor. Ne yapmalıyım?' },
        { fromAdmin: true, content: 'Merhaba, başvurunuzu aldık. Ödeme işleminizi sistemimizden inceliyoruz. Bankanızın referans numarasını paylaşabilir misiniz?', isInternal: false },
        { fromAdmin: true, content: 'Ödeme gateway logları kontrol edildi. İşlem 14:32\'de alındı ancak sipariş sistemine yansımamış. Teknik ekibe iletildi.', isInternal: true },
      ],
    },
    {
      cat: TicketCategory.shipping,
      subj: 'Kargom 10 gündür teslim edilmedi',
      pri: TicketPriority.high,
      status: TicketStatus.waiting_customer,
      messages: [
        { fromAdmin: false, content: 'Merhaba, 10 gün önce satın aldığım ürün hâlâ gelmedi. Takip numarası: SRT-887654321. Sürat Kargo sitesinde "Dağıtıma Çıktı" yazıyor ama teslim edilmiyor.' },
        { fromAdmin: true, content: 'Merhaba, kargo takip numaranızı kontrol ettik. Sürat Kargo\'ya başvuruldu. Teslimat adresinizde kapıcı veya güvenlik görevlisi var mı? Bazen bırıakma notu bırakılıyor.', isInternal: false },
        { fromAdmin: false, content: 'Evet, kapıcı var ama not bırakılmamış. Komşulara da sormadım, sorayım.' },
        { fromAdmin: true, content: 'Lütfen komşularınızı kontrol edin ve bize geri dönün. Çözülmezse kargo firmasına resmi kayıp bildirimi açacağız.', isInternal: false },
      ],
    },
    {
      cat: TicketCategory.trade,
      subj: 'Takas teklifim kabul edildi ama ürün gönderilmedi',
      pri: TicketPriority.high,
      status: TicketStatus.in_progress,
      messages: [
        { fromAdmin: false, content: 'Kullanıcı "ahmet_koleksiyoncu" ile takas anlaştık. 5 gün önce teklifim kabul edildi. Ben kendi ürünümü gönderdim ve teslim alındı (kargo takibi var) ama karşı taraf hâlâ göndermedi. Yardımcı olur musunuz?' },
        { fromAdmin: true, content: 'Merhaba, takas talebinizi aldık. Takas ID\'nizi (TRD-XXXXX formatında) paylaşabilir misiniz?', isInternal: false },
        { fromAdmin: true, content: 'Kullanıcı ahmet_koleksiyoncu 3 benzer şikayetle işaretlenmiş. Hesap incelemeye alındı.', isInternal: true },
        { fromAdmin: false, content: 'Takas numarası: TRD-1A2B3C4D. Teşekkürler.' },
        { fromAdmin: true, content: 'Takas kaydınızı inceledik. Karşı tarafla iletişime geçildi; 48 saat içinde göndermezse takas iptal edilerek ürününüz iade sürecine alınacak.', isInternal: false },
      ],
    },
    {
      cat: TicketCategory.account,
      subj: 'İki faktörlü doğrulama kodunu almıyorum',
      pri: TicketPriority.medium,
      status: TicketStatus.resolved,
      messages: [
        { fromAdmin: false, content: 'Hesabıma giriş yapmaya çalışıyorum ama SMS kodu gelmiyor. Telefon numaram doğru: 0532 *** **45. Spam klasörünü de kontrol ettim, yok.' },
        { fromAdmin: true, content: 'Merhaba, SMS gönderim loglarını kontrol ettik. Operatör kaynaklı gecikme gözüküyor. Alternatif olarak e-posta ile doğrulama yapmak ister misiniz?', isInternal: false },
        { fromAdmin: false, content: 'Evet, e-posta ile olabilir.' },
        { fromAdmin: true, content: 'E-posta doğrulama bağlantısı gönderildi. Lütfen gelen kutunuzu (spam dahil) kontrol edin.', isInternal: false },
        { fromAdmin: false, content: 'Geldi, giriş yapabildim. Çok teşekkürler!' },
        { fromAdmin: true, content: 'Rica ederiz. Başka sorunuz olursa yardımcı olmaktan memnuniyet duyarız.', isInternal: false },
      ],
    },
    {
      cat: TicketCategory.product,
      subj: 'Ürün açıklamasıyla gerçek hali uyuşmuyor',
      pri: TicketPriority.high,
      status: TicketStatus.open,
      messages: [
        { fromAdmin: false, content: 'Aldığım 1:18 ölçekli Porsche 911 modeli ilan fotoğraflarında "mint condition, orijinal kutu" yazıyordu. Ancak ürün hasarlı geldi ve kutusuz. Fotoğraf ekledim: [ek-1.jpg, ek-2.jpg]. İade veya tam tazminat istiyorum.' },
      ],
    },
    {
      cat: TicketCategory.technical,
      subj: 'Mobil uygulamada ödeme sayfası açılmıyor',
      pri: TicketPriority.urgent,
      status: TicketStatus.in_progress,
      messages: [
        { fromAdmin: false, content: 'iPhone 14 Pro, iOS 17.4 kullanıyorum. Uygulama v2.3.1. Ödeme sayfasına geçince uygulama aniden kapanıyor. 3 kez denedim, hep aynı. Satın almayı tamamlayamıyorum.' },
        { fromAdmin: true, content: 'Merhaba, bildirdiğiniz için teşekkürler. Bu sorunu geliştirme ekibimize bildirdik. Geçici çözüm olarak web tarayıcısı (Safari/Chrome) üzerinden satın alma işlemini gerçekleştirebilirsiniz.', isInternal: false },
        { fromAdmin: true, content: 'iOS crash log alındı. Ödeme iframe\'inde WKWebView hatası. Bir sonraki patch\'te düzelecek. Öncelik: P1.', isInternal: true },
      ],
    },
    {
      cat: TicketCategory.other,
      subj: 'Satıcı hesabı başvurusu hakkında bilgi almak istiyorum',
      pri: TicketPriority.low,
      status: TicketStatus.closed,
      messages: [
        { fromAdmin: false, content: 'Merhaba, koleksiyonumun bir kısmını satmak istiyorum. Satıcı hesabı başvurusu nasıl yapılıyor ve onay süreci ne kadar sürüyor?' },
        { fromAdmin: true, content: 'Merhaba! Satıcı başvurusu için profil sayfanızdaki "Satıcı Ol" butonuna tıklayabilirsiniz. Belgelerinizi (kimlik + IBAN) yükledikten sonra genellikle 1-3 iş günü içinde inceleme tamamlanır.', isInternal: false },
        { fromAdmin: false, content: 'Anladım, teşekkürler. Hemen başvuracağım.' },
        { fromAdmin: true, content: 'Başarılar! Başvurunuzu aldığımızda size e-posta ile bilgi vereceğiz. Başka sorunuz olursa tekrar yazabilirsiniz.', isInternal: false },
      ],
    },
    {
      cat: TicketCategory.payment,
      subj: 'Yanlış tutarda fatura kesildi',
      pri: TicketPriority.medium,
      status: TicketStatus.open,
      messages: [
        { fromAdmin: false, content: 'Sipariş toplam tutarım 1.250 TL iken faturamda 1.450 TL yazıyor. Aradaki 200 TL fark nereden kaynaklanıyor? Faturamı düzeltmenizi talep ediyorum.' },
      ],
    },
    {
      cat: TicketCategory.shipping,
      subj: 'Yanlış adrese gönderim yapıldı',
      pri: TicketPriority.high,
      status: TicketStatus.waiting_customer,
      messages: [
        { fromAdmin: false, content: 'Siparişim eski adresime gönderilmiş. Adres değişikliğini sipariş onayından önce yaptım ama sanırım sisteme işlenmedi. Ürünü nasıl alabilirim?' },
        { fromAdmin: true, content: 'Merhaba, kargo firmasına iade talimatı verildi. Paket depoya döndükten sonra doğru adresinize tekrar göndereceğiz. Yeni adresinizi onaylayabilir misiniz?', isInternal: false },
        { fromAdmin: false, content: 'Yeni adresim: Kadıköy, Moda Cad. No:45/3, 34710 İstanbul.' },
        { fromAdmin: true, content: 'Adresinizi güncelledik. Paket depoya ulaştığında (tahminen 2-3 iş günü) size tekrar bilgilendirme yapacağız.', isInternal: false },
      ],
    },
    {
      cat: TicketCategory.account,
      subj: 'Hesabım sebepsiz askıya alındı',
      pri: TicketPriority.high,
      status: TicketStatus.open,
      messages: [
        { fromAdmin: false, content: 'Bugün sisteme giriş yapamadım ve "Hesabınız askıya alınmıştır" mesajı aldım. Herhangi bir kural ihlali yapmadım, neden askıya alındığını anlamıyorum. Acil yardım lütfen.' },
      ],
    },
  ];

  const tickets: any[] = [];
  for (let i = 0; i < ticketScenarios.length; i++) {
    const scenario = ticketScenarios[i];
    const user = users[3 + (i % (users.length - 3))];
    const isResolved = scenario.status === TicketStatus.resolved || scenario.status === TicketStatus.closed;

    try {
      const createdAt = randomPastDate(20);
      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber: generateTicketNumber(),
          creatorId: user.id,
          assigneeId: scenario.status !== TicketStatus.open ? moderator.id : null,
          category: scenario.cat,
          priority: scenario.pri,
          status: scenario.status,
          subject: scenario.subj,
          resolvedAt: isResolved ? randomPastDate(2) : null,
          closedAt: scenario.status === TicketStatus.closed ? randomPastDate(1) : null,
          createdAt,
        },
      });

      // Mesajları zaman sırasıyla ekle
      for (let m = 0; m < scenario.messages.length; m++) {
        const msg = scenario.messages[m];
        const msgDate = new Date(createdAt.getTime() + (m + 1) * 3_600_000); // her mesaj 1 saat arayla
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderId: msg.fromAdmin ? moderator.id : user.id,
            content: msg.content,
            isInternal: msg.isInternal ?? false,
            createdAt: msgDate,
          },
        });
      }

      tickets.push(ticket);
    } catch (e) {
      // Ignore errors
    }
  }

  // Ek: kısa konuşmalı basit biletler (hacim için)
  const simpleTemplates = [
    { cat: TicketCategory.trade, subj: 'Takas fiyatı konusunda anlaşamadık', pri: TicketPriority.low },
    { cat: TicketCategory.technical, subj: 'Fotoğraf yükleme çalışmıyor', pri: TicketPriority.medium },
    { cat: TicketCategory.product, subj: 'İlan onayı ne zaman gelecek?', pri: TicketPriority.low },
    { cat: TicketCategory.other, subj: 'Kampanya kodu çalışmıyor', pri: TicketPriority.medium },
    { cat: TicketCategory.shipping, subj: 'Kargo bedelini satıcı mı öder?', pri: TicketPriority.low },
  ];
  for (let i = 0; i < simpleTemplates.length; i++) {
    const tpl = simpleTemplates[i];
    const user = users[3 + ((i + ticketScenarios.length) % (users.length - 3))];
    const status = i % 3 === 0 ? TicketStatus.open : TicketStatus.in_progress;
    try {
      const createdAt = randomPastDate(7);
      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber: generateTicketNumber(),
          creatorId: user.id,
          assigneeId: status !== TicketStatus.open ? moderator.id : null,
          category: tpl.cat,
          priority: tpl.pri,
          status,
          subject: tpl.subj,
          createdAt,
        },
      });
      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: user.id,
          content: `Merhaba, "${tpl.subj.toLowerCase()}" konusunda yardıma ihtiyacım var.`,
          createdAt: new Date(createdAt.getTime() + 300_000),
        },
      });
      if (status !== TicketStatus.open) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderId: moderator.id,
            content: 'Merhaba, talebinizi aldık. İnceliyoruz ve kısa sürede dönüş yapacağız.',
            createdAt: new Date(createdAt.getTime() + 7_200_000),
          },
        });
      }
      tickets.push(ticket);
    } catch (e) {
      // Ignore errors
    }
  }

  console.log(`✅ Created ${tickets.length} support tickets`);

  // ==========================================================================
  // 21b. Create Static Pages
  // ==========================================================================
  console.log('Creating static pages...');
  const staticPageDefs = [
    {
      slug: 'about',
      title: 'Hakkımızda',
      content: '<h1>Hakkımızda</h1><p>Tarodan, Türkiye\'nin diecast model araba koleksiyoncuları için en büyük pazaryeridir.</p>',
      metaTitle: 'Hakkımızda | Tarodan',
      metaDescription: 'Tarodan hakkında bilgi edinin.',
      sortOrder: 0,
    },
    {
      slug: 'faq',
      title: 'Sıkça Sorulan Sorular',
      content: '<h1>SSS</h1><p>Genel sorular ve cevaplar. Bu içerik admin panelinden düzenlenebilir.</p>',
      metaTitle: 'SSS | Tarodan',
      metaDescription: 'Sıkça sorulan sorular.',
      sortOrder: 1,
    },
    {
      slug: 'privacy',
      title: 'Gizlilik Politikası',
      content: `<h1>Gizlilik Politikası</h1>
<p><strong>Son güncelleme:</strong> Haziran 2026</p>
<p>Tarodan olarak kişisel verilerinizin güvenliğine önem veriyoruz. Bu Gizlilik Politikası, tarodan.shop adresini ziyaret ettiğinizde hangi verileri topladığımızı, nasıl kullandığımızı ve koruduğumuzu açıklamaktadır.</p>
<h2>1. Toplanan Veriler</h2>
<ul>
  <li><strong>Kimlik verileri:</strong> Ad, soyad, e-posta adresi, telefon numarası, doğum tarihi.</li>
  <li><strong>İşlem verileri:</strong> Satın alma geçmişi, teklif ve takas kayıtları. Kart numaraları yalnızca PayTR altyapısında saklanır.</li>
  <li><strong>Teknik veriler:</strong> IP adresi, tarayıcı türü, çerezler, sayfa görüntüleme istatistikleri.</li>
  <li><strong>İletişim verileri:</strong> Platform içi mesajlar ve destek talepleri.</li>
</ul>
<h2>2. Verilerin Kullanım Amaçları</h2>
<ul>
  <li>Hesap oluşturma ve kimlik doğrulama.</li>
  <li>Sipariş, kargo ve ödeme işlemlerinin yönetimi.</li>
  <li>Müşteri desteği ve şikayet yönetimi.</li>
  <li>Platform güvenliği ve sahteciliğin önlenmesi.</li>
  <li>Yasal yükümlülüklerin yerine getirilmesi (KVKK).</li>
</ul>
<h2>3. KVKK Kapsamındaki Haklarınız</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca verilerinize erişim, düzeltme, silme ve itiraz haklarına sahipsiniz.</p>
<p>Talepleriniz için: <a href="mailto:kvkk@tarodan.com">kvkk@tarodan.com</a></p>
<h2>4. İletişim</h2>
<p><a href="mailto:destek@tarodan.com">destek@tarodan.com</a></p>`,
      metaTitle: 'Gizlilik Politikası | Tarodan',
      metaDescription: 'Tarodan gizlilik politikası ve KVKK aydınlatma metni.',
      sortOrder: 2,
    },
    {
      slug: 'terms',
      title: 'Kullanım Koşulları',
      content: `<h1>Kullanım Koşulları</h1>
<p><strong>Son güncelleme:</strong> Haziran 2026</p>
<p>Bu Kullanım Koşulları, tarodan.shop platformunu kullanan tüm kullanıcılar için geçerlidir. Platforma erişerek bu koşulları kabul etmiş sayılırsınız.</p>
<h2>1. Hizmet Tanımı</h2>
<p>Tarodan, diecast ve koleksiyon model araba alım-satım ve takas işlemlerini kolaylaştıran bir çevrimiçi pazar yeridir.</p>
<h2>2. Üyelik Koşulları</h2>
<ul>
  <li>Üyelik için 18 yaşında veya daha büyük olmanız gerekmektedir.</li>
  <li>Doğru ve güncel bilgiler sağlamakla yükümlüsünüz.</li>
  <li>Hesap güvenliğinden siz sorumlusunuz.</li>
</ul>
<h2>3. İlan Verme Kuralları</h2>
<ul>
  <li>Yalnızca gerçekten sahip olduğunuz ürünleri listeleyebilirsiniz.</li>
  <li>Yanıltıcı, sahte veya telif hakkı ihlali içeren ilanlar yasaktır.</li>
  <li>Ürün durumu, fotoğraflar ve açıklama doğru olmalıdır.</li>
</ul>
<h2>4. Ödeme ve Güvence</h2>
<p>Ödemeler PayTR güvenli ödeme altyapısı üzerinden gerçekleştirilir. Alıcının ödediği tutar, ürünün teslim edildiği doğrulanana kadar Tarodan güvencesinde bekletilir.</p>
<h2>5. İptal ve İade</h2>
<ul>
  <li>Sipariş kargo öncesinde iptal edilebilir.</li>
  <li>Teslim alınan ürün açıklamaya uymuyorsa 3 iş günü içinde iade talebi açılabilir.</li>
</ul>
<h2>6. İletişim</h2>
<p><a href="mailto:destek@tarodan.com">destek@tarodan.com</a></p>`,
      metaTitle: 'Kullanım Koşulları | Tarodan',
      metaDescription: 'Tarodan platform kullanım koşulları ve üyelik sözleşmesi.',
      sortOrder: 3,
    },
    {
      slug: 'cookie-policy',
      title: 'Çerez Politikası',
      content: `<h1>Çerez Politikası</h1>
<p><strong>Son güncelleme:</strong> Haziran 2026</p>
<p>Tarodan olarak web sitemizde çerezler kullanmaktayız.</p>
<h2>Zorunlu Çerezler</h2>
<p>Oturum yönetimi ve güvenlik için gereklidir. Devre dışı bırakılamaz.</p>
<h2>Analitik Çerezler</h2>
<p>Kullanıcı davranışını anlamamıza yardımcı olur. Tarayıcı ayarlarınızdan devre dışı bırakılabilir.</p>
<h2>Çerez Yönetimi</h2>
<p>Tarayıcınızın ayarlar menüsünden veya sayfamızdaki "Çerez Ayarları" butonundan tercihlerinizi yönetebilirsiniz.</p>`,
      metaTitle: 'Çerez Politikası | Tarodan',
      metaDescription: 'Tarodan çerez politikası.',
      sortOrder: 4,
    },
  ];
  for (const p of staticPageDefs) {
    await prisma.staticPage.upsert({
      where: { slug: p.slug },
      create: { ...p, isPublished: true },
      update: { title: p.title, content: p.content, metaTitle: p.metaTitle, metaDescription: p.metaDescription, sortOrder: p.sortOrder, isPublished: true },
    });
  }
  console.log(`✅ Created/updated ${staticPageDefs.length} static pages`);

  // ==========================================================================
  // 22. Create Analytics Snapshots
  // ==========================================================================
  console.log('Creating analytics snapshots...');

  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    try {
      await prisma.analyticsSnapshot.create({
        data: {
          snapshotType: 'daily',
          snapshotDate: new Date(dateStr),
          totalUsers: users.length + Math.floor(Math.random() * 10),
          totalProducts: products.length - i,
          totalOrders: orders.length - Math.floor(i / 2),
          totalTrades: trades.length,
          totalRevenue: Math.floor(Math.random() * 50000) + 10000,
          newUsers: Math.floor(Math.random() * 5),
          newOrders: Math.floor(Math.random() * 10),
          data: {
            activeListings: products.filter(p => p.status === ProductStatus.active).length,
            completedTrades: trades.filter(t => t.status === TradeStatus.completed).length,
            averageOrderValue: 450 + Math.floor(Math.random() * 200),
          },
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log(`✅ Created analytics snapshots`);

  // ==========================================================================
  // 23. Create Search Indexes
  // ==========================================================================
  console.log('Creating search indexes...');

  await prisma.searchIndex.upsert({
    where: { indexName: 'products' },
    update: { documentCount: products.length },
    create: {
      indexName: 'products',
      documentCount: products.length,
      status: 'active',
      settings: {
        mappings: {
          title: { type: 'text', analyzer: 'turkish' },
          description: { type: 'text', analyzer: 'turkish' },
          category: { type: 'keyword' },
          price: { type: 'float' },
          condition: { type: 'keyword' },
        },
      },
    },
  });

  await prisma.searchIndex.upsert({
    where: { indexName: 'users' },
    update: { documentCount: users.length },
    create: {
      indexName: 'users',
      documentCount: users.length,
      status: 'active',
      settings: { mappings: { displayName: { type: 'text' }, bio: { type: 'text' } } },
    },
  });

  console.log(`✅ Created search indexes`);

  // ==========================================================================
  // 24. Email Templates
  // ==========================================================================
  console.log('Creating email templates...');
  const emailTemplates = [
    {
      key: 'welcome',
      name: 'Hoş Geldiniz',
      subject: 'Tarodan\'a Hoş Geldiniz, {{displayName}}!',
      bodyHtml: `<h1>Merhaba {{displayName}},</h1>
<p>Tarodan ailesine hoş geldiniz! Artık diecast model araba koleksiyonunuzu büyütmeye hazırsınız.</p>
<p>Başlamak için: <a href="{{frontendUrl}}/listings">İlanları Keşfet</a></p>
<p>İyi koleksiyonlar,<br>Tarodan Ekibi</p>`,
      variablesJson: JSON.stringify(['displayName', 'frontendUrl']),
    },
    {
      key: 'email_verification',
      name: 'E-posta Doğrulama',
      subject: 'E-posta Adresinizi Doğrulayın',
      bodyHtml: `<h1>E-posta Doğrulama</h1>
<p>Merhaba {{displayName}},</p>
<p>Hesabınızı doğrulamak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{verificationUrl}}">E-postamı Doğrula</a></p>
<p>Bu bağlantı 24 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>`,
      variablesJson: JSON.stringify(['displayName', 'verificationUrl']),
    },
    {
      key: 'password_reset',
      name: 'Şifre Sıfırlama',
      subject: 'Şifre Sıfırlama Talebi',
      bodyHtml: `<h1>Şifre Sıfırlama</h1>
<p>Merhaba {{displayName}},</p>
<p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{resetUrl}}">Şifremi Sıfırla</a></p>
<p>Bu bağlantı 1 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>`,
      variablesJson: JSON.stringify(['displayName', 'resetUrl']),
    },
    {
      key: 'order_placed',
      name: 'Sipariş Oluşturuldu',
      subject: 'Siparişiniz Alındı — #{{orderNumber}}',
      bodyHtml: `<h1>Siparişiniz Alındı!</h1>
<p>Merhaba {{buyerName}},</p>
<p><strong>#{{orderNumber}}</strong> numaralı siparişiniz başarıyla oluşturuldu.</p>
<p>Ürün: {{productTitle}}</p>
<p>Tutar: {{amount}} TL</p>
<p>Sipariş durumunuzu takip etmek için: <a href="{{orderUrl}}">Siparişimi Görüntüle</a></p>`,
      variablesJson: JSON.stringify(['buyerName', 'orderNumber', 'productTitle', 'amount', 'orderUrl']),
    },
    {
      key: 'order_shipped',
      name: 'Sipariş Kargoya Verildi',
      subject: 'Siparişiniz Kargoya Verildi — #{{orderNumber}}',
      bodyHtml: `<h1>Siparişiniz Yola Çıktı!</h1>
<p>Merhaba {{buyerName}},</p>
<p><strong>#{{orderNumber}}</strong> numaralı siparişiniz kargoya verildi.</p>
<p>Kargo Firması: Sürat Kargo</p>
<p>Takip No: <strong>{{trackingNumber}}</strong></p>
<p><a href="{{trackingUrl}}">Kargomu Takip Et</a></p>`,
      variablesJson: JSON.stringify(['buyerName', 'orderNumber', 'trackingNumber', 'trackingUrl']),
    },
    {
      key: 'offer_received',
      name: 'Yeni Teklif Alındı',
      subject: '{{productTitle}} için yeni bir teklif aldınız',
      bodyHtml: `<h1>Yeni Teklif!</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{buyerName}}</strong> adlı kullanıcı <strong>{{productTitle}}</strong> ilanınıza <strong>{{offerAmount}} TL</strong> teklif verdi.</p>
<p><a href="{{offerUrl}}">Teklifi İncele</a></p>`,
      variablesJson: JSON.stringify(['sellerName', 'buyerName', 'productTitle', 'offerAmount', 'offerUrl']),
    },
    {
      key: 'trade_request',
      name: 'Takas Talebi',
      subject: 'Yeni Takas Talebi — {{productTitle}}',
      bodyHtml: `<h1>Takas Talebi</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{requesterName}}</strong> adlı kullanıcı <strong>{{productTitle}}</strong> ilanınız için takas teklif etti.</p>
<p><a href="{{tradeUrl}}">Takası İncele</a></p>`,
      variablesJson: JSON.stringify(['sellerName', 'requesterName', 'productTitle', 'tradeUrl']),
    },
    {
      key: 'payout_sent',
      name: 'Ödeme Gönderildi',
      subject: 'Satış geliriniz IBAN\'ınıza aktarıldı',
      bodyHtml: `<h1>Ödemeniz Gönderildi</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{amount}} TL</strong> tutarındaki satış geliriniz IBAN\'ınıza aktarıldı.</p>
<p>İşlem Tarihi: {{date}}</p>`,
      variablesJson: JSON.stringify(['sellerName', 'amount', 'date']),
    },
  ];

  for (const t of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: { name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, variablesJson: t.variablesJson },
      create: t,
    });
  }
  console.log(`✅ Created/updated ${emailTemplates.length} email templates`);

  // ==========================================================================
  // 25. Discounts
  // ==========================================================================
  console.log('Creating discounts...');
  const discountNow = new Date();
  const inOneYear = new Date(discountNow.getFullYear() + 1, discountNow.getMonth(), discountNow.getDate());
  const lastWeek = new Date(discountNow.getTime() - 7 * 24 * 60 * 60 * 1000);

  const discounts = [
    {
      code: 'HOSGELDIN10',
      name: 'Hoş Geldin İndirimi',
      description: 'Yeni üyeler için ilk alışverişte %10 indirim',
      type: 'percentage' as const,
      value: 10,
      scope: 'global' as const,
      minCartValue: 100,
      usageLimitTotal: 1000,
      usageLimitPerUser: 1,
      isActive: true,
      startDate: discountNow,
      endDate: inOneYear,
      priority: 1,
    },
    {
      code: 'TARODAN50',
      name: '50 TL İndirim Kuponu',
      description: '500 TL ve üzeri alışverişlerde 50 TL indirim',
      type: 'fixed_amount' as const,
      value: 50,
      scope: 'global' as const,
      minCartValue: 500,
      usageLimitTotal: 500,
      usageLimitPerUser: 1,
      isActive: true,
      startDate: discountNow,
      endDate: inOneYear,
      priority: 2,
    },
    {
      code: 'DIECAST20',
      name: 'Diecast Severlere %20',
      description: 'Diecast kategorisinde %20 indirim',
      type: 'percentage' as const,
      value: 20,
      scope: 'global' as const,
      minCartValue: 200,
      maxDiscountAmount: 300,
      usageLimitTotal: 200,
      usageLimitPerUser: 2,
      isActive: true,
      startDate: discountNow,
      endDate: inOneYear,
      priority: 3,
    },
    {
      code: 'FLASHSALE',
      name: 'Flash Satış',
      description: 'Sınırlı süreli fırsat — %30 indirim',
      type: 'percentage' as const,
      value: 30,
      scope: 'global' as const,
      usageLimitTotal: 50,
      usageLimitPerUser: 1,
      isActive: false,
      isFlashSale: true,
      startDate: lastWeek,
      endDate: discountNow,
      priority: 10,
    },
  ];

  for (const d of discounts) {
    await prisma.discount.upsert({
      where: { code: d.code },
      update: { name: d.name, isActive: d.isActive },
      create: d,
    });
  }
  console.log(`✅ Created/updated ${discounts.length} discounts`);

  // ==========================================================================
  // 27. Moderation Events (örnek AI denetim kayıtları)
  // ==========================================================================
  console.log('Creating moderation events...');
  const sampleProducts = products.slice(0, 5);
  const sampleUsers = users.slice(0, 4);

  const moderationEvents = [
    { entityType: 'product', entityId: sampleProducts[0]?.id, userId: sampleUsers[0]?.id, kind: 'image', field: 'product_image', decision: 'pass', relevanceScore: 0.95, nsfwScore: 0.01, labels: { diecast: 0.95, car: 0.92 } },
    { entityType: 'product', entityId: sampleProducts[1]?.id, userId: sampleUsers[1]?.id, kind: 'image', field: 'product_image', decision: 'pass', relevanceScore: 0.88, nsfwScore: 0.02, labels: { model_car: 0.88, vehicle: 0.85 } },
    { entityType: 'product', entityId: sampleProducts[2]?.id, userId: sampleUsers[2]?.id, kind: 'text', field: 'description', decision: 'review', relevanceScore: 0.55, nsfwScore: 0.05, reason: 'Düşük alaka skoru — manuel inceleme gerekiyor' },
    { entityType: 'product', entityId: sampleProducts[3]?.id, userId: sampleUsers[3]?.id, kind: 'image', field: 'product_image', decision: 'flag', nsfwScore: 0.72, reason: 'Yüksek NSFW skoru — içerik politikasını ihlal edebilir' },
    { entityType: 'user', entityId: sampleUsers[0]?.id, userId: sampleUsers[0]?.id, kind: 'image', field: 'avatar', decision: 'pass', relevanceScore: 0.90, nsfwScore: 0.01, labels: { person: 0.90 } },
    { entityType: 'user', entityId: sampleUsers[1]?.id, userId: sampleUsers[1]?.id, kind: 'text', field: 'bio', decision: 'pass', relevanceScore: 0.80, nsfwScore: 0.00, reason: null },
    { entityType: 'upload', entityId: null, userId: sampleUsers[2]?.id, kind: 'image', field: 'upload', decision: 'blocked', nsfwScore: 0.93, reason: 'Uygunsuz içerik — yükleme engellendi' },
    { entityType: 'product', entityId: sampleProducts[4]?.id, userId: sampleUsers[0]?.id, kind: 'image', field: 'product_image', decision: 'pass', relevanceScore: 0.91, nsfwScore: 0.00, labels: { diecast: 0.91, sports_car: 0.87 } },
  ];

  const existingModCount = await prisma.moderationEvent.count();
  if (existingModCount === 0) {
    for (const ev of moderationEvents) {
      if (ev.entityId || ev.entityType === 'upload') {
        await prisma.moderationEvent.create({ data: ev as any });
      }
    }
    console.log(`✅ Created ${moderationEvents.length} moderation events`);
  } else {
    console.log(`✅ Moderation events already exist (${existingModCount})`);
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n🎉 COMPREHENSIVE Database seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`   - Categories: ${categories.length}`);
  console.log(`   - Vehicle Brands: ${brands.length}`);
  console.log(`   - Car Models: ${carModels.length}`);
  console.log(`   - Manufacturers: ${manufacturers.length}`);
  console.log(`   - Membership Tiers: ${membershipTiers.length}`);
  console.log(`   - Commission Rules: ${commissionRules.length}`);
  console.log(`   - Content Filters: ${contentFilters.length}`);
  console.log(`   - Platform Settings: ${settings.length}`);
  console.log(`   - Users: ${users.length} (with avatars)`);
  console.log(`   - Products: ${products.length} (unique, with full data)`);
  console.log(`   - Collections: ${collections.length} (with covers)`);
  console.log(`   - Offers: ${offers.length}`);
  console.log(`   - Orders: ${orders.length}`);
  console.log(`   - Refund Requests: ${refundRequests.length} (${refundedPaymentCount} refunded payments)`);
  console.log(`   - Trades: ${trades.length}`);
  console.log(`   - Conversations: ${conversations.length}`);
  console.log(`   - Support Tickets: ${tickets.length}`);
  
  console.log('\n👤 Test Accounts:');
  console.log('   ┌─────────────────────────────────────────────────────────────┐');
  console.log('   │ Role              │ Email                  │ Password      │');
  console.log('   ├─────────────────────────────────────────────────────────────┤');
  console.log('   │ Super Admin       │ admin@tarodan.com      │ Admin123!     │');
  console.log('   │ Moderator         │ moderator@tarodan.com  │ Admin123!     │');
  console.log('   │ Platform Seller   │ platform@tarodan.com   │ Demo123!      │');
  console.log('   │ Premium User      │ ahmet@demo.com         │ Demo123!      │');
  console.log('   │ Business User     │ ali@demo.com           │ Demo123!      │');
  console.log('   │ Basic User        │ mehmet@demo.com        │ Demo123!      │');
  console.log('   │ Free User         │ zeynep@demo.com        │ Demo123!      │');
  console.log('   │ Buyer Only        │ deniz@demo.com         │ Demo123!      │');
  console.log('   └─────────────────────────────────────────────────────────────┘');
  
  console.log('\n🔧 What you can test:');
  console.log('   ✓ User authentication (login/register)');
  console.log('   ✓ Product listing and filtering by category, price, condition');
  console.log('   ✓ Product search');
  console.log('   ✓ Making and receiving offers');
  console.log('   ✓ Creating and managing orders');
  console.log('   ✓ Trading/swapping products');
  console.log('   ✓ Messaging between users');
  console.log('   ✓ Collections (creating, viewing)');
  console.log('   ✓ Wishlists (adding/removing products)');
  console.log('   ✓ Ratings and reviews');
  console.log('   ✓ Support tickets');
  console.log('   ✓ Admin panel (users, products, orders, trades, settings)');
  console.log('   ✓ Membership tiers and features');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
