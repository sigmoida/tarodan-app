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
  MessageStatus,
  TicketStatus,
  TicketPriority,
  TicketCategory
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/modules/storage/storage.service';
import { PrismaService } from '../src/prisma';

const prisma = new PrismaClient();

// Helper to generate random price
const randomPrice = (min: number, max: number) => 
  Math.round((Math.random() * (max - min) + min) * 100) / 100;

// Helper to generate order number
const generateOrderNumber = () => 
  `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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

interface PhotoFile {
  filename: string;
  filepath: string;
  mimeType: string;
  buffer: Buffer;
}

// Initialize StorageService for seed script
const initStorageService = (): StorageService | null => {
  try {
    // Create mock ConfigService
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
  } catch (error) {
    console.error('⚠️ Failed to initialize StorageService:', error);
    return null;
  }
};

// Get MIME type from file extension
const getMimeType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return mimeTypes[ext] || 'image/jpeg';
};

// Load photos from photos folder
const loadPhotosFromFolder = (): PhotoFile[] => {
  // Seed script runs from apps/api/ when using npx prisma db seed
  // Photos folder is at project root: diecast/photos
  const photosDir = path.join(process.cwd(), '..', '..', 'photos');
  const photos: PhotoFile[] = [];

  try {
    if (!fs.existsSync(photosDir)) {
      console.log(`⚠️ Photos directory not found: ${photosDir}`);
      return photos;
    }

    const files = fs.readdirSync(photosDir);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const filepath = path.join(photosDir, file);
        try {
          const buffer = fs.readFileSync(filepath);
          photos.push({
            filename: file,
            filepath: filepath,
            mimeType: getMimeType(file),
            buffer: buffer,
          });
        } catch (error) {
          console.error(`⚠️ Failed to read photo ${file}:`, error);
        }
      }
    }

    console.log(`📸 Loaded ${photos.length} photos from ${photosDir}`);
  } catch (error) {
    console.error('⚠️ Error loading photos:', error);
  }

  return photos;
};

// Upload photo to S3 using StorageService
const uploadPhotoToS3 = async (
  storageService: StorageService,
  photo: PhotoFile,
  bucket: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets' = 'products',
  folder: string = 'product-images'
): Promise<{ key: string } | null> => {
  try {
    // Generate unique filename
    const uniqueId = randomUUID().substring(0, 8);
    const ext = path.extname(photo.filename);
    const filename = `${uniqueId}-${photo.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to S3 using StorageService
    const result = await storageService.uploadFile(
      photo.buffer,
      {
        bucket,
        folder,
        filename,
        mimeType: photo.mimeType,
      }
    );

    return { key: result.key };
  } catch (error: any) {
    console.error(`⚠️ Failed to upload photo ${photo.filename} to S3:`, error.message);
    return null;
  }
};

// Match photo filename to product title
const matchPhotoToProduct = (filename: string, productTitle: string): boolean => {
  const normalizedFilename = filename.toLowerCase();
  const normalizedTitle = productTitle.toLowerCase();

  // Extract keywords from filename
  const keywords: string[] = [];
  
  // Common patterns
  if (normalizedFilename.includes('911')) {
    keywords.push('porsche 911', '911');
  }
  if (normalizedFilename.includes('ferrari') && normalizedFilename.includes('f40')) {
    keywords.push('ferrari f40', 'f40');
  }
  if (normalizedFilename.includes('bmw') && (normalizedFilename.includes('m3') || normalizedFilename.includes('e30'))) {
    keywords.push('bmw m3', 'm3 e30', 'bmw');
  }
  if (normalizedFilename.includes('bmw')) {
    keywords.push('bmw');
  }
  if (normalizedFilename.includes('honda') && normalizedFilename.includes('civic')) {
    keywords.push('honda civic', 'civic');
  }
  if (normalizedFilename.includes('ford') && normalizedFilename.includes('raptor')) {
    keywords.push('ford f-150 raptor', 'raptor', 'f-150');
  }
  if (normalizedFilename.includes('ford') && (normalizedFilename.includes('mustang') || normalizedFilename.includes('mach'))) {
    keywords.push('ford mustang', 'mustang mach', 'mustang');
  }
  if (normalizedFilename.includes('toyota') || normalizedFilename.includes('supra')) {
    keywords.push('toyota supra', 'supra');
  }
  if (normalizedFilename.includes('mazda') || normalizedFilename.includes('miata')) {
    keywords.push('mazda mx-5', 'mazda miata', 'miata', 'mx-5');
  }
  if (normalizedFilename.includes('mitsubishi') || (normalizedFilename.includes('lancer') && normalizedFilename.includes('evo'))) {
    keywords.push('mitsubishi lancer evo', 'lancer evo', 'evo');
  }
  if (normalizedFilename.includes('land rover') || normalizedFilename.includes('defender')) {
    keywords.push('land rover defender', 'defender');
  }
  if (normalizedFilename.includes('mercedes') && (normalizedFilename.includes('amg') || normalizedFilename.includes('gt'))) {
    keywords.push('mercedes amg gt', 'mercedes amg', 'amg gt');
  }
  if (normalizedFilename.includes('alfa') || normalizedFilename.includes('romeo')) {
    keywords.push('alfa romeo');
  }
  if (normalizedFilename.includes('aston') || normalizedFilename.includes('martin')) {
    keywords.push('aston martin');
  }
  if (normalizedFilename.includes('hot wheels') && normalizedFilename.includes('japan')) {
    keywords.push('hot wheels', 'japan');
  }
  if (normalizedFilename.includes('majorette') && normalizedFilename.includes('racing')) {
    keywords.push('majorette', 'racing');
  }
  if (normalizedFilename.includes('majorette')) {
    keywords.push('majorette');
  }
  if (normalizedFilename.includes('hot wheels')) {
    keywords.push('hot wheels');
  }

  // Check if any keyword matches product title
  return keywords.some(keyword => normalizedTitle.includes(keyword));
};

async function main() {
  console.log('🌱 Starting COMPREHENSIVE database seed...');
  console.log('📦 This will create a large dataset for testing ALL features\n');

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

  // Mevcut veriyi yeni kategorilere taşı, eski kategorileri kaldır
  const arabaCategory = categories.find((c) => c.slug === 'araba')!;
  await prisma.product.updateMany({ data: { categoryId: arabaCategory.id } });
  await prisma.collection.updateMany({ data: { categoryId: null } });
  await prisma.commissionRule.updateMany({
    where: { categoryId: { not: null } },
    data: { categoryId: arabaCategory.id },
  });
  await prisma.taxRule.updateMany({
    where: { categoryId: { not: null } },
    data: { categoryId: arabaCategory.id },
  });
  await prisma.discount.updateMany({
    where: { categoryId: { not: null } },
    data: { categoryId: arabaCategory.id },
  });
  const newSlugs = categoryData.map((c) => c.slug);
  await prisma.category.deleteMany({ where: { slug: { notIn: newSlugs } } });

  console.log(`✅ Created ${categories.length} categories (vehicle types only)`);

  // ==========================================================================
  // 1b. Create Manufacturers
  // ==========================================================================
  console.log('Creating manufacturers...');

  const manufacturerData = [
    { name: 'Hot Wheels', slug: 'hot-wheels', country: 'ABD', description: 'Mattel tarafından üretilen diecast model araba markası' },
    { name: 'Matchbox', slug: 'matchbox', country: 'İngiltere', description: 'Lesney Products tarafından başlatılan diecast model markası' },
    { name: 'Majorette', slug: 'majorette', country: 'Fransa', description: 'Fransız diecast model araba üreticisi' },
    { name: 'Tomica', slug: 'tomica', country: 'Japonya', description: 'Takara Tomy tarafından üretilen Japon diecast model markası' },
    { name: 'Bburago', slug: 'bburago', country: 'İtalya', description: 'İtalyan diecast model araba üreticisi' },
    { name: 'Maisto', slug: 'maisto', country: 'ABD', description: 'Amerikan diecast model araba üreticisi' },
    { name: 'AUTOart', slug: 'autoart', country: 'Hong Kong', description: 'Yüksek kaliteli koleksiyon diecast model üreticisi' },
    { name: 'Minichamps', slug: 'minichamps', country: 'Almanya', description: 'Alman model araba üreticisi, özellikle F1 modelleri' },
    { name: 'Kyosho', slug: 'kyosho', country: 'Japonya', description: 'Japon model araba ve RC araç üreticisi' },
    { name: 'CMC', slug: 'cmc', country: 'Almanya', description: 'Premium koleksiyon modelleri üreticisi' },
    { name: 'GT Spirit', slug: 'gt-spirit', country: 'Fransa', description: 'Resin model araba üreticisi' },
    { name: 'Almost Real', slug: 'almost-real', country: 'Çin', description: 'Yüksek detaylı diecast model üreticisi' },
    { name: 'Spark', slug: 'spark', country: 'Çin', description: 'Resin model araba üreticisi, yarış modelleri' },
    { name: 'Schuco', slug: 'schuco', country: 'Almanya', description: 'Alman model araba üreticisi' },
    { name: 'Norev', slug: 'norev', country: 'Fransa', description: 'Fransız diecast model üreticisi' },
    { name: 'Oxford Diecast', slug: 'oxford-diecast', country: 'İngiltere', description: 'İngiliz diecast model üreticisi' },
    { name: 'Greenlight', slug: 'greenlight', country: 'ABD', description: 'Amerikan diecast model üreticisi' },
    { name: 'ERTL', slug: 'ertl', country: 'ABD', description: 'Amerikan diecast model üreticisi' },
    { name: 'Tamiya', slug: 'tamiya', country: 'Japonya', description: 'Japon model kit ve diecast üreticisi' },
    { name: 'Welly', slug: 'welly', country: 'Hong Kong', description: 'Diecast model araba üreticisi' },
  ];

  const manufacturers = await Promise.all(
    manufacturerData.map((m, i) =>
      prisma.manufacturer.upsert({
        where: { slug: m.slug },
        update: { name: m.name, country: m.country, description: m.description },
        create: { ...m, sortOrder: i + 1 },
      })
    )
  );

  console.log(`✅ Created ${manufacturers.length} manufacturers`);

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
    prisma.platformSetting.upsert({ where: { settingKey: 'default_carrier' }, update: {}, create: { settingKey: 'default_carrier', settingValue: 'aras', settingType: 'string', description: 'Varsayılan kargo firması' } }),
    prisma.platformSetting.upsert({ where: { settingKey: 'trade_response_deadline_hours' }, update: {}, create: { settingKey: 'trade_response_deadline_hours', settingValue: '72', settingType: 'number', description: 'Takas teklifi yanıt süresi' } }),
  ]);

  console.log(`✅ Created ${settings.length} platform settings`);

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
      update: {},
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
  // 10. Create Products (100+ products)
  // ==========================================================================
  console.log('Creating products...');

  const productTemplates = [
    // Araba
    { title: 'Hot Wheels Vintage 1960s Ferrari 275 GTB', cat: 'araba', price: [8000, 15000], cond: ProductCondition.good },
    { title: 'Matchbox 1965 James Bond Aston Martin', cat: 'araba', price: [5000, 10000], cond: ProductCondition.fair },
    { title: 'Tamiya Vintage Collection 1950s', cat: 'araba', price: [3000, 7000], cond: ProductCondition.good },
    { title: 'AUTOart Classic Mercedes 300SL Gullwing', cat: 'araba', price: [10000, 18000], cond: ProductCondition.good },
    { title: 'Kyosho Vintage Porsche 356', cat: 'araba', price: [4000, 8000], cond: ProductCondition.like_new },
    { title: 'Maisto Classic Corvette 1963', cat: 'araba', price: [2000, 5000], cond: ProductCondition.good },
    { title: 'Bburago Vintage Alfa Romeo', cat: 'araba', price: [3000, 6000], cond: ProductCondition.fair },
    { title: 'Greenlight Vintage Collection', cat: 'araba', price: [2500, 5500], cond: ProductCondition.good },
    { title: 'Majorette Vintage Set', cat: 'araba', price: [1500, 3500], cond: ProductCondition.good },
    { title: 'Tomica Limited Vintage Collection', cat: 'araba', price: [6000, 12000], cond: ProductCondition.new },
    { title: 'Minichamps Vintage Racing', cat: 'araba', price: [5000, 10000], cond: ProductCondition.like_new },
    
    // Spor Kategorisi - Anasayfadaki markalarla
    { title: 'Hot Wheels Nissan Skyline GT-R R34', cat: 'araba', price: [150, 450], cond: ProductCondition.new },
    { title: 'Hot Wheels Porsche 911 GT3 RS', cat: 'araba', price: [120, 350], cond: ProductCondition.new },
    { title: 'Hot Wheels Lamborghini Aventador', cat: 'araba', price: [200, 500], cond: ProductCondition.new },
    { title: 'Matchbox McLaren P1', cat: 'araba', price: [100, 300], cond: ProductCondition.new },
    { title: 'Tamiya Toyota Supra MK4', cat: 'araba', price: [300, 600], cond: ProductCondition.new },
    { title: 'AUTOart 1:18 Lamborghini Huracan', cat: 'araba', price: [4000, 6000], cond: ProductCondition.new },
    { title: 'Kyosho 1:18 Nissan GT-R R35', cat: 'araba', price: [3500, 5500], cond: ProductCondition.new },
    { title: 'Maisto 1:24 Ferrari F8 Tributo', cat: 'araba', price: [300, 600], cond: ProductCondition.new },
    { title: 'Bburago 1:24 Lamborghini Aventador', cat: 'araba', price: [250, 500], cond: ProductCondition.new },
    { title: 'Greenlight Sports Car Series', cat: 'araba', price: [150, 350], cond: ProductCondition.new },
    { title: 'Majorette Porsche 911 Turbo', cat: 'araba', price: [40, 100], cond: ProductCondition.new },
    { title: 'Tomica Honda NSX Type-R', cat: 'araba', price: [120, 300], cond: ProductCondition.new },
    { title: 'Minichamps 1:43 Sports Car Collection', cat: 'araba', price: [500, 900], cond: ProductCondition.new },
    
    // Muscle Kategorisi - Anasayfadaki markalarla
    { title: 'Hot Wheels Dodge Challenger R/T 1970', cat: 'araba', price: [150, 350], cond: ProductCondition.new },
    { title: 'Hot Wheels Ford Mustang Mach 1 1971', cat: 'araba', price: [200, 450], cond: ProductCondition.new },
    { title: 'Matchbox 1970 Ford Mustang Boss 429', cat: 'araba', price: [150, 400], cond: ProductCondition.good },
    { title: 'Greenlight Muscle Car Garage', cat: 'araba', price: [120, 280], cond: ProductCondition.new },
    { title: 'Greenlight Route 66 Muscle Collection', cat: 'araba', price: [200, 450], cond: ProductCondition.like_new },
    { title: 'Maisto Chevrolet Camaro SS 1969', cat: 'araba', price: [180, 400], cond: ProductCondition.like_new },
    { title: 'Bburago Dodge Charger 1970', cat: 'araba', price: [160, 380], cond: ProductCondition.new },
    { title: 'AUTOart 1:18 Plymouth Barracuda', cat: 'araba', price: [3000, 5500], cond: ProductCondition.new },
    { title: 'Kyosho 1:18 Ford Mustang GT500', cat: 'araba', price: [2500, 4500], cond: ProductCondition.new },
    
    // Kamyon Kategorisi - Anasayfadaki markalarla
    { title: 'Hot Wheels Ford F-150 Raptor 2023', cat: 'kamyon', price: [150, 350], cond: ProductCondition.new },
    { title: 'Matchbox Land Rover Defender', cat: 'kamyon', price: [80, 200], cond: ProductCondition.new },
    { title: 'Tamiya Toyota Land Cruiser J70', cat: 'kamyon', price: [200, 450], cond: ProductCondition.like_new },
    { title: 'Maisto Jeep Wrangler Rubicon', cat: 'kamyon', price: [120, 280], cond: ProductCondition.new },
    { title: 'Bburago Mercedes G-Class', cat: 'kamyon', price: [180, 400], cond: ProductCondition.new },
    { title: 'Greenlight Pickup Truck Series', cat: 'kamyon', price: [100, 250], cond: ProductCondition.new },
    { title: 'Majorette SUV Collection', cat: 'kamyon', price: [50, 120], cond: ProductCondition.new },
    { title: 'Tomica Toyota Hilux', cat: 'kamyon', price: [80, 180], cond: ProductCondition.new },
    { title: 'AUTOart 1:18 Ford F-150 Raptor', cat: 'kamyon', price: [3500, 5500], cond: ProductCondition.new },
    
    // F1 Kategorisi - Anasayfadaki markalarla
    { title: 'Hot Wheels Formula 1 Collection', cat: 'motorspor', price: [200, 500], cond: ProductCondition.new },
    { title: 'Matchbox F1 Racing Set', cat: 'motorspor', price: [150, 400], cond: ProductCondition.new },
    { title: 'Tamiya F1 Model Kit', cat: 'motorspor', price: [400, 800], cond: ProductCondition.new },
    { title: 'AUTOart 1:18 F1 Championship Car', cat: 'motorspor', price: [5000, 9000], cond: ProductCondition.new },
    { title: 'Kyosho 1:18 Formula 1', cat: 'motorspor', price: [4500, 8000], cond: ProductCondition.new },
    { title: 'Maisto F1 Racing Collection', cat: 'motorspor', price: [300, 600], cond: ProductCondition.new },
    { title: 'Bburago F1 Championship Series', cat: 'motorspor', price: [250, 500], cond: ProductCondition.new },
    { title: 'Minichamps 1:43 F1 Racing', cat: 'motorspor', price: [600, 1200], cond: ProductCondition.new },
    { title: 'Greenlight F1 Legends', cat: 'motorspor', price: [180, 400], cond: ProductCondition.new },
    
    // Custom Kategorisi - Anasayfadaki markalarla
    { title: 'Hot Wheels Custom Modified Nissan Skyline', cat: 'araba', price: [300, 700], cond: ProductCondition.new },
    { title: 'Hot Wheels Custom Paint Job Collection', cat: 'araba', price: [250, 600], cond: ProductCondition.new },
    { title: 'Matchbox Custom Build Series', cat: 'araba', price: [150, 400], cond: ProductCondition.new },
    { title: 'Tamiya Custom Drift Car', cat: 'araba', price: [500, 1000], cond: ProductCondition.new },
    { title: 'Greenlight Custom Hot Rod', cat: 'araba', price: [200, 500], cond: ProductCondition.new },
    { title: 'Maisto Custom Lowrider', cat: 'araba', price: [180, 450], cond: ProductCondition.new },
    { title: 'Bburago Custom Tuning Series', cat: 'araba', price: [220, 550], cond: ProductCondition.new },
    { title: 'Majorette Custom Racing', cat: 'araba', price: [100, 250], cond: ProductCondition.new },
    { title: 'Tomica Custom Modified', cat: 'araba', price: [300, 650], cond: ProductCondition.new },
  ];

  const products: any[] = [];
  const sellers = users.filter(u => u.isSeller);
  // More pending products for admin testing (40% pending, 40% active, 10% reserved, 5% sold, 5% inactive)
  const statuses = [
    ProductStatus.pending, ProductStatus.pending, ProductStatus.pending, ProductStatus.pending, // 40% pending
    ProductStatus.active, ProductStatus.active, ProductStatus.active, ProductStatus.active, // 40% active
    ProductStatus.reserved, ProductStatus.reserved, // 10% reserved
    ProductStatus.sold, // 5% sold
    ProductStatus.inactive, // 5% inactive
  ];

  const resolveManufacturer = (title: string) => {
    const lowerTitle = title.toLowerCase();
    const mapping: Record<string, string> = {
      'hot wheels': 'hot-wheels', 'matchbox': 'matchbox', 'majorette': 'majorette',
      'tomica': 'tomica', 'bburago': 'bburago', 'maisto': 'maisto',
      'autoart': 'autoart', 'minichamps': 'minichamps', 'kyosho': 'kyosho',
      'cmc': 'cmc', 'gt spirit': 'gt-spirit', 'almost real': 'almost-real',
      'spark': 'spark', 'schuco': 'schuco', 'norev': 'norev',
      'oxford diecast': 'oxford-diecast', 'greenlight': 'greenlight',
      'ertl': 'ertl', 'tamiya': 'tamiya', 'welly': 'welly',
    };
    for (const [keyword, slug] of Object.entries(mapping)) {
      if (lowerTitle.includes(keyword)) {
        return manufacturers.find((m) => m.slug === slug)?.id ?? null;
      }
    }
    return null;
  };

  // Create 100+ products
  for (let i = 0; i < 120; i++) {
    const template = productTemplates[i % productTemplates.length];
    const seller = sellers[i % sellers.length];
    const category = categories.find((c) => c.slug === template.cat) || categories[0];
    const price = randomPrice(template.price[0], template.price[1]);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const manufacturerId = resolveManufacturer(template.title);
    
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: `${template.title} #${i + 1}`,
        description: `Kaliteli ${template.title} modeli. Koleksiyonunuz için mükemmel bir parça. Detaylı fotoğraflar için mesaj atabilirsiniz. ${i % 3 === 0 ? 'Takas yapılabilir.' : ''}`,
        price: price,
        condition: template.cond,
        status: status,
        isTradeEnabled: i % 2 === 0 || seller.displayName.includes('Premium') || seller.displayName.includes('Business'),
        viewCount: Math.floor(Math.random() * 500),
        createdAt: randomPastDate(60),
        manufacturerId: manufacturerId,
      },
    });
    products.push(product);
  }

  console.log(`✅ Created ${products.length} products`);

  // ==========================================================================
  // 11. Create Product Images
  // ==========================================================================
  console.log('Creating product images...');

  // Try to load photos from photos folder and upload to S3
  const storageService = initStorageService();
  const photos = loadPhotosFromFolder();
  const uploadedPhotos: Array<{ key: string; filename: string; photo: PhotoFile }> = [];
  let useRealPhotos = false;

  if (storageService && photos.length > 0) {
    // Initialize storage service
    await storageService.onModuleInit();
    
    if (storageService.isStorageAvailable()) {
      console.log(`📤 Uploading ${photos.length} photos to S3...`);
      
      for (const photo of photos) {
        const result = await uploadPhotoToS3(storageService, photo);
        if (result) {
          uploadedPhotos.push({
            key: result.key,
            filename: photo.filename,
            photo: photo,
          });
        }
      }

      if (uploadedPhotos.length > 0) {
        useRealPhotos = true;
        console.log(`✅ Successfully uploaded ${uploadedPhotos.length} photos to S3`);
      } else {
        console.log('⚠️ No photos were uploaded, falling back to placeholder images');
      }
    } else {
      console.log('⚠️ S3 storage not available, using placeholder images');
    }
  } else {
    if (!storageService) {
      console.log('⚠️ StorageService not available, using placeholder images');
    }
    if (photos.length === 0) {
      console.log('⚠️ No photos found, using placeholder images');
    }
  }

  // Delete existing placeholder images if we have real photos
  // But keep real images (S3 keys)
  if (useRealPhotos && uploadedPhotos.length > 0) {
    await prisma.productImage.deleteMany({
      where: {
        productId: {
          in: products.map(p => p.id),
        },
        OR: [
          { url: { contains: 'via.placeholder.com' } },
          { url: { contains: 'placeholder' } },
        ],
      },
    });
  }

  // Track which photos have been used for matching
  const usedPhotoIndices = new Set<number>();
  const availablePhotoIndices = uploadedPhotos.map((_, index) => index);
  let roundRobinIndex = 0;

  // Check existing images for each product
  const productsWithImages = await prisma.product.findMany({
    where: {
      id: { in: products.map(p => p.id) },
    },
    include: {
      images: {
        where: {
          OR: [
            { url: { not: { contains: 'via.placeholder.com' } } },
            { url: { not: { contains: 'placeholder' } } },
          ],
        },
      },
    },
  });

  const productsWithoutRealImages = products.filter(p => {
    const productWithImages = productsWithImages.find(pwi => pwi.id === p.id);
    return !productWithImages || productWithImages.images.length === 0;
  });

  console.log(`📊 ${productsWithoutRealImages.length} products need images (${products.length - productsWithoutRealImages.length} already have real images)`);

  // Assign photos to products that need them
  for (const product of productsWithoutRealImages) {
    let selectedPhoto: typeof uploadedPhotos[0] | null = null;

    if (useRealPhotos && uploadedPhotos.length > 0) {
      // Try to find matching photo (only from unused photos)
      let matchedPhotoIndex = -1;
      for (let i = 0; i < uploadedPhotos.length; i++) {
        if (!usedPhotoIndices.has(i) && matchPhotoToProduct(uploadedPhotos[i].filename, product.title)) {
          matchedPhotoIndex = i;
          break;
        }
      }

      if (matchedPhotoIndex >= 0) {
        // Use matched photo
        selectedPhoto = uploadedPhotos[matchedPhotoIndex];
        usedPhotoIndices.add(matchedPhotoIndex);
        // Remove from available list
        const idx = availablePhotoIndices.indexOf(matchedPhotoIndex);
        if (idx > -1) {
          availablePhotoIndices.splice(idx, 1);
        }
      } else {
        // Use random photo from available ones
        if (availablePhotoIndices.length > 0) {
          const randomIdx = Math.floor(Math.random() * availablePhotoIndices.length);
          const selectedIndex = availablePhotoIndices[randomIdx];
          selectedPhoto = uploadedPhotos[selectedIndex];
          usedPhotoIndices.add(selectedIndex);
          availablePhotoIndices.splice(randomIdx, 1);
        } else {
          // All photos used, use round-robin
          selectedPhoto = uploadedPhotos[roundRobinIndex % uploadedPhotos.length];
          roundRobinIndex++;
        }
      }
    }

    // Create product image
    if (selectedPhoto && storageService) {
      // Store S3 key directly (presigned URL will be generated on-demand in API)
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: selectedPhoto.key, // S3 key kaydet: "dev/products/product-images/abc123.jpg"
          sortOrder: 0,
        },
      });
    } else {
      // Fallback to placeholder
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `https://via.placeholder.com/800x600?text=${encodeURIComponent(product.title)}`,
          sortOrder: 0,
        },
      });
    }
  }

  const imageType = useRealPhotos ? 'real photos' : 'placeholder images';
  console.log(`✅ Created product images (${imageType})`);

  // ==========================================================================
  // 12. Create Collections
  // ==========================================================================
  console.log('Creating collections...');

  const collectionData = [
    { user: users[3], name: 'En İyi JDM Modelleri', slug: 'best-jdm', desc: 'Japon spor arabalarından oluşan özel koleksiyonum' },
    { user: users[5], name: 'Vintage Hazinelerim', slug: 'vintage-treasures', desc: 'Antika ve nadir diecast modeller' },
    { user: users[7], name: 'Premium 1:18 Vitrinim', slug: 'premium-118', desc: 'En değerli 1:18 ölçekli modellerim' },
    { user: users[4], name: 'Muscle Car Cenneti', slug: 'muscle-heaven', desc: 'Amerikan kas arabaları koleksiyonu' },
    { user: users[6], name: 'Hot Wheels Treasure Hunt', slug: 'hw-treasure-hunt', desc: 'Super ve Regular Treasure Hunt modelleri' },
    { user: users[9], name: 'Takas Listesi', slug: 'trade-list', desc: 'Takas için açık modellerim' },
  ];

  const collections: any[] = [];
  for (const cd of collectionData) {
    const collection = await prisma.collection.upsert({
      where: { id: `collection-${cd.slug}` },
      update: {},
      create: {
        id: `collection-${cd.slug}`,
        userId: cd.user.id,
        name: cd.name,
        slug: cd.slug,
        description: cd.desc,
        isPublic: true,
        viewCount: Math.floor(Math.random() * 200),
        likeCount: Math.floor(Math.random() * 50),
      },
    });
    collections.push(collection);
  }

  // Add products to collections
  for (const collection of collections) {
    const itemCount = Math.floor(Math.random() * 8) + 3; // 3-10 items
    const shuffled = products.sort(() => 0.5 - Math.random());
    for (let i = 0; i < itemCount; i++) {
      try {
        await prisma.collectionItem.create({
          data: {
            collectionId: collection.id,
            productId: shuffled[i].id,
            sortOrder: i,
            isFeatured: i === 0,
          },
        });
      } catch (e) {
        // Ignore duplicate errors
      }
    }
  }

  console.log(`✅ Created ${collections.length} collections`);

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
    const totalAmount = Number(product.price);
    const commission = totalAmount * 0.05;
    const buyerAddress = addresses.find(a => a.userId === buyer.id);

    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          buyerId: buyer.id,
          sellerId: product.sellerId,
          productId: product.id,
          totalAmount: totalAmount,
          shippingCost: 30,
          commissionAmount: commission,
          status: status,
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
          provider: Math.random() > 0.5 ? 'iyzico' : 'paytr',
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
    const carrier = ['aras', 'yurtici', 'mng'][Math.floor(Math.random() * 3)];
    const shipmentStatus = order.status === OrderStatus.shipped ? ShipmentStatus.in_transit : ShipmentStatus.delivered;
    
    try {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          provider: carrier,
          trackingNumber: `${carrier.toUpperCase()}${Math.random().toString().substring(2, 14)}`,
          trackingUrl: `https://${carrier}.com.tr/tracking/`,
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
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Create some product ratings
  for (let i = 0; i < 30; i++) {
    const order = completedOrders[i % completedOrders.length];
    if (!order) continue;
    
    try {
      await prisma.productRating.create({
        data: {
          productId: order.productId,
          userId: order.buyerId,
          orderId: order.id,
          score: Math.floor(Math.random() * 2) + 4,
          title: ['Mükemmel!', 'Harika ürün', 'Beklentilerimi karşıladı', 'Çok kaliteli'][Math.floor(Math.random() * 4)],
          review: 'Ürün açıklamaya uygun, paketleme çok iyi yapılmış. Satıcıya teşekkürler.',
          isVerifiedPurchase: true,
          helpfulCount: Math.floor(Math.random() * 20),
        },
      });
    } catch (e) {
      // Ignore duplicates
    }
  }

  console.log(`✅ Created ratings`);

  // ==========================================================================
  // 21. Create Support Tickets
  // ==========================================================================
  console.log('Creating support tickets...');

  const ticketTemplates = [
    { cat: TicketCategory.payment, subj: 'Ödeme başarısız oldu', pri: TicketPriority.high },
    { cat: TicketCategory.shipping, subj: 'Kargom nerede?', pri: TicketPriority.medium },
    { cat: TicketCategory.trade, subj: 'Takas anlaşmazlığı', pri: TicketPriority.high },
    { cat: TicketCategory.account, subj: 'Şifre sıfırlama sorunu', pri: TicketPriority.medium },
    { cat: TicketCategory.product, subj: 'Ürün açıklamasıyla uyuşmuyor', pri: TicketPriority.high },
    { cat: TicketCategory.technical, subj: 'Uygulama çöküyor', pri: TicketPriority.urgent },
    { cat: TicketCategory.other, subj: 'Genel soru', pri: TicketPriority.low },
  ];

  const tickets: any[] = [];
  for (let i = 0; i < 15; i++) {
    const template = ticketTemplates[i % ticketTemplates.length];
    const user = users[3 + (i % (users.length - 3))];
    const status = [TicketStatus.open, TicketStatus.in_progress, TicketStatus.waiting_customer, TicketStatus.resolved, TicketStatus.closed][Math.floor(Math.random() * 5)];

    try {
      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber: generateTicketNumber(),
          creatorId: user.id,
          assigneeId: status !== TicketStatus.open ? moderator.id : null,
          category: template.cat,
          priority: template.pri,
          status: status,
          subject: `${template.subj} #${i + 1}`,
          resolvedAt: status === TicketStatus.resolved || status === TicketStatus.closed ? randomPastDate(2) : null,
          closedAt: status === TicketStatus.closed ? randomPastDate(1) : null,
          createdAt: randomPastDate(14),
        },
      });

      // Add messages to ticket
      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: user.id,
          content: `Merhaba, ${template.subj.toLowerCase()} konusunda yardıma ihtiyacım var. Lütfen en kısa sürede dönüş yapabilir misiniz?`,
        },
      });

      if (status !== TicketStatus.open) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderId: moderator.id,
            content: 'Merhaba, talebinizi aldık. İnceliyoruz ve en kısa sürede size dönüş yapacağız.',
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
  // 21b. Create Static Pages (About, FAQ)
  // ==========================================================================
  if (prisma.staticPage) {
    console.log('Creating static pages...');
    const pages = [
      { slug: 'about', title: 'Hakkımızda', content: '<h1>Hakkımızda</h1><p>Tarodan, Türkiye\'nin diecast model araba koleksiyoncuları için en büyük pazaryeridir.</p>', metaTitle: 'Hakkımızda | Tarodan', metaDescription: 'Tarodan hakkında bilgi edinin.', sortOrder: 0 },
      { slug: 'faq', title: 'Sıkça Sorulan Sorular', content: '<h1>SSS</h1><p>Genel sorular ve cevaplar. Bu içerik admin panelinden düzenlenebilir.</p>', metaTitle: 'SSS | Tarodan', metaDescription: 'Sıkça sorulan sorular.', sortOrder: 1 },
    ];
    for (const p of pages) {
      await (prisma as any).staticPage.upsert({
        where: { slug: p.slug },
        create: p,
        update: { title: p.title, content: p.content, metaTitle: p.metaTitle, metaDescription: p.metaDescription, sortOrder: p.sortOrder },
      });
    }
    console.log(`✅ Created ${pages.length} static pages`);
  }

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
  // Summary
  // ==========================================================================
  console.log('\n🎉 COMPREHENSIVE Database seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`   - Categories: ${categories.length}`);
  console.log(`   - Membership Tiers: ${membershipTiers.length}`);
  console.log(`   - Commission Rules: ${commissionRules.length}`);
  console.log(`   - Content Filters: ${contentFilters.length}`);
  console.log(`   - Platform Settings: ${settings.length}`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Products: ${products.length}`);
  console.log(`   - Collections: ${collections.length}`);
  console.log(`   - Offers: ${offers.length}`);
  console.log(`   - Orders: ${orders.length}`);
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
