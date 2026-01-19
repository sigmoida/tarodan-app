import { 
  PrismaClient, 
  AdminRole, 
  CommissionRuleType, 
  SellerType,
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
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

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

// Initialize MinIO client
const initMinIOClient = (): Minio.Client | null => {
  try {
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000', 10);
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';

    return new Minio.Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });
  } catch (error) {
    console.error('⚠️ Failed to initialize MinIO client:', error);
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

// Upload photo to MinIO
const uploadPhotoToMinIO = async (
  minioClient: Minio.Client,
  photo: PhotoFile,
  bucket: string = 'products',
  folder: string = 'product-images'
): Promise<{ url: string; key: string } | null> => {
  try {
    // Ensure bucket exists
    const bucketExists = await minioClient.bucketExists(bucket);
    if (!bucketExists) {
      await minioClient.makeBucket(bucket, 'tr-istanbul');
      console.log(`✅ Created MinIO bucket: ${bucket}`);

      // Set public read policy
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
    }

    // Generate unique key
    const uniqueId = randomUUID().substring(0, 8);
    const ext = path.extname(photo.filename);
    const key = `${folder}/${uniqueId}-${photo.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to MinIO
    await minioClient.putObject(
      bucket,
      key,
      photo.buffer,
      photo.buffer.length,
      {
        'Content-Type': photo.mimeType,
      }
    );

    // Generate public URL
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const url = `http://${endpoint}:${port}/${bucket}/${key}`;

    return { url, key };
  } catch (error) {
    console.error(`⚠️ Failed to upload photo ${photo.filename} to MinIO:`, error);
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
  // 1. Create Categories - Comprehensive Diecast Model Cars
  // ==========================================================================
  console.log('Creating categories...');
  
  const mainCategory = await prisma.category.upsert({
    where: { slug: 'diecast-model-cars' },
    update: {},
    create: {
      name: 'Diecast Model Arabalar',
      slug: 'diecast-model-cars',
      description: 'Tüm diecast model arabalar',
      sortOrder: 0,
    },
  });

  const categoryData = [
    { name: 'Hot Wheels', slug: 'hot-wheels', description: 'Hot Wheels diecast model araçlar', sortOrder: 1 },
    { name: 'Hot Wheels Premium', slug: 'hot-wheels-premium', description: 'Hot Wheels Premium serisi', sortOrder: 2 },
    { name: 'Hot Wheels RLC', slug: 'hot-wheels-rlc', description: 'Red Line Club exclusive modeller', sortOrder: 3 },
    { name: 'Matchbox', slug: 'matchbox', description: 'Matchbox diecast model araçlar', sortOrder: 4 },
    { name: 'Tomica', slug: 'tomica', description: 'Tomica diecast model araçlar', sortOrder: 5 },
    { name: 'Tomica Limited Vintage', slug: 'tomica-limited-vintage', description: 'TLV serisi premium modeller', sortOrder: 6 },
    { name: 'Majorette', slug: 'majorette', description: 'Majorette diecast model araçlar', sortOrder: 7 },
    { name: 'M2 Machines', slug: 'm2-machines', description: 'M2 Machines detaylı modeller', sortOrder: 8 },
    { name: 'Greenlight', slug: 'greenlight', description: 'Greenlight koleksiyon modelleri', sortOrder: 9 },
    { name: 'Johnny Lightning', slug: 'johnny-lightning', description: 'Johnny Lightning modelleri', sortOrder: 10 },
    { name: '1:18 Scale Models', slug: 'scale-118', description: '1:18 ölçekli premium model arabalar', sortOrder: 11 },
    { name: '1:24 Scale Models', slug: 'scale-124', description: '1:24 ölçekli model arabalar', sortOrder: 12 },
    { name: '1:43 Scale Models', slug: 'scale-143', description: '1:43 ölçekli koleksiyon arabaları', sortOrder: 13 },
    { name: '1:64 Scale Models', slug: 'scale-164', description: '1:64 ölçekli model arabalar', sortOrder: 14 },
    { name: 'Vintage Diecast', slug: 'vintage-diecast', description: 'Antika ve vintage diecast modeller', sortOrder: 15 },
    { name: 'Limited Edition', slug: 'limited-edition', description: 'Sınırlı üretim koleksiyon modelleri', sortOrder: 16 },
    { name: 'Muscle Cars', slug: 'muscle-cars', description: 'Amerikan kas arabaları', sortOrder: 17 },
    { name: 'JDM Legends', slug: 'jdm-legends', description: 'Japon efsaneleri', sortOrder: 18 },
    { name: 'European Classics', slug: 'european-classics', description: 'Avrupa klasikleri', sortOrder: 19 },
    { name: 'Trucks & SUVs', slug: 'trucks-suvs', description: 'Kamyonlar ve SUV modelleri', sortOrder: 20 },
  ];

  const categories = await Promise.all(
    categoryData.map(cat => 
      prisma.category.upsert({
        where: { slug: cat.slug },
        update: {},
        create: { ...cat, parentId: mainCategory.id },
      })
    )
  );

  categories.unshift(mainCategory);
  console.log(`✅ Created ${categories.length} categories`);

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
        name: 'Vintage Diecast Komisyonu',
        ruleType: CommissionRuleType.category,
        categoryId: categories.find(c => c.slug === 'vintage-diecast')?.id,
        percentage: 0.07,
        priority: 5,
        isActive: true,
      },
    }),
    prisma.commissionRule.upsert({
      where: { id: 'limited-rule' },
      update: {},
      create: {
        id: 'limited-rule',
        name: 'Limited Edition Komisyonu',
        ruleType: CommissionRuleType.category,
        categoryId: categories.find(c => c.slug === 'limited-edition')?.id,
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
        sellerType: SellerType.platform,
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
        sellerType: SellerType.verified,
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
    { name: 'Ali Premium', email: 'ali@demo.com', bio: 'Premium ve RLC modeller', seller: true, type: SellerType.verified },
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
      update: {},
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
    const address = await prisma.address.upsert({
      where: { id: `address-${users[i].id}` },
      update: {},
      create: {
        id: `address-${users[i].id}`,
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
    // Hot Wheels
    { title: 'Hot Wheels 2024 Nissan Skyline GT-R R34', cat: 'hot-wheels', price: [150, 450], cond: ProductCondition.new },
    { title: 'Hot Wheels Super Treasure Hunt 2023', cat: 'hot-wheels', price: [500, 1500], cond: ProductCondition.new },
    { title: 'Hot Wheels Toyota AE86 Trueno', cat: 'hot-wheels', price: [100, 300], cond: ProductCondition.like_new },
    { title: 'Hot Wheels Mazda RX-7 FD', cat: 'hot-wheels', price: [80, 200], cond: ProductCondition.very_good },
    { title: 'Hot Wheels Honda Civic EG6', cat: 'hot-wheels', price: [60, 150], cond: ProductCondition.good },
    { title: 'Hot Wheels Porsche 911 GT3 RS', cat: 'hot-wheels', price: [120, 350], cond: ProductCondition.new },
    { title: 'Hot Wheels BMW M3 E30', cat: 'hot-wheels', price: [90, 250], cond: ProductCondition.like_new },
    { title: 'Hot Wheels Lamborghini Countach', cat: 'hot-wheels', price: [70, 180], cond: ProductCondition.very_good },
    
    // Hot Wheels Premium
    { title: 'Hot Wheels Premium Fast & Furious Set', cat: 'hot-wheels-premium', price: [400, 800], cond: ProductCondition.new },
    { title: 'Hot Wheels Premium Car Culture Japan Historics', cat: 'hot-wheels-premium', price: [250, 500], cond: ProductCondition.new },
    { title: 'Hot Wheels Premium Boulevard Real Riders', cat: 'hot-wheels-premium', price: [200, 400], cond: ProductCondition.like_new },
    
    // Hot Wheels RLC
    { title: 'Hot Wheels RLC Datsun 510 Blue', cat: 'hot-wheels-rlc', price: [1500, 3000], cond: ProductCondition.new },
    { title: 'Hot Wheels RLC 55 Chevy Bel Air Gasser', cat: 'hot-wheels-rlc', price: [1200, 2500], cond: ProductCondition.new },
    { title: 'Hot Wheels RLC Mercedes 300 SL', cat: 'hot-wheels-rlc', price: [1800, 3500], cond: ProductCondition.like_new },
    
    // Matchbox
    { title: 'Matchbox 1970 Ford Mustang Boss 429', cat: 'matchbox', price: [150, 400], cond: ProductCondition.good },
    { title: 'Matchbox Land Rover Defender', cat: 'matchbox', price: [80, 200], cond: ProductCondition.new },
    { title: 'Matchbox Jurassic World Set', cat: 'matchbox', price: [200, 450], cond: ProductCondition.new },
    { title: 'Matchbox Volkswagen Beetle', cat: 'matchbox', price: [50, 120], cond: ProductCondition.very_good },
    
    // Tomica
    { title: 'Tomica Toyota AE86 Initial D Edition', cat: 'tomica', price: [300, 600], cond: ProductCondition.new },
    { title: 'Tomica Nissan GT-R Nismo', cat: 'tomica', price: [100, 250], cond: ProductCondition.like_new },
    { title: 'Tomica Honda NSX Type-R', cat: 'tomica', price: [120, 300], cond: ProductCondition.new },
    { title: 'Tomica Mazda MX-5 Miata', cat: 'tomica', price: [60, 150], cond: ProductCondition.very_good },
    
    // Tomica Limited Vintage
    { title: 'TLV Nissan Fairlady Z 432', cat: 'tomica-limited-vintage', price: [800, 1500], cond: ProductCondition.new },
    { title: 'TLV Toyota Celica 2000GT', cat: 'tomica-limited-vintage', price: [600, 1200], cond: ProductCondition.like_new },
    { title: 'TLV Mazda Savanna RX-3', cat: 'tomica-limited-vintage', price: [700, 1400], cond: ProductCondition.new },
    
    // Majorette
    { title: 'Majorette Porsche 911 Turbo', cat: 'majorette', price: [40, 100], cond: ProductCondition.new },
    { title: 'Majorette Lamborghini Aventador', cat: 'majorette', price: [50, 120], cond: ProductCondition.like_new },
    { title: 'Majorette Racing Cars Set', cat: 'majorette', price: [100, 250], cond: ProductCondition.new },
    
    // M2 Machines
    { title: 'M2 Machines 1957 Chevy Bel Air', cat: 'm2-machines', price: [200, 450], cond: ProductCondition.new },
    { title: 'M2 Machines Ford Mustang 1965', cat: 'm2-machines', price: [180, 400], cond: ProductCondition.like_new },
    { title: 'M2 Machines Auto-Haulers Set', cat: 'm2-machines', price: [350, 700], cond: ProductCondition.new },
    
    // Greenlight
    { title: 'Greenlight Hollywood Series', cat: 'greenlight', price: [150, 350], cond: ProductCondition.new },
    { title: 'Greenlight Muscle Car Garage', cat: 'greenlight', price: [120, 280], cond: ProductCondition.new },
    { title: 'Greenlight Route 66 Collection', cat: 'greenlight', price: [200, 450], cond: ProductCondition.like_new },
    
    // 1:18 Scale
    { title: 'AutoArt 1:18 Porsche 911 GT3 RS', cat: 'scale-118', price: [4000, 6000], cond: ProductCondition.new },
    { title: 'Kyosho 1:18 Nissan GT-R R35', cat: 'scale-118', price: [3500, 5500], cond: ProductCondition.new },
    { title: 'Minichamps 1:18 BMW M3 E30', cat: 'scale-118', price: [2500, 4500], cond: ProductCondition.like_new },
    { title: 'CMC 1:18 Ferrari 250 GTO', cat: 'scale-118', price: [8000, 15000], cond: ProductCondition.new },
    
    // 1:24 Scale
    { title: 'Jada 1:24 Fast & Furious Supra', cat: 'scale-124', price: [400, 800], cond: ProductCondition.new },
    { title: 'Maisto 1:24 Lamborghini Huracan', cat: 'scale-124', price: [300, 600], cond: ProductCondition.new },
    { title: 'Welly 1:24 Porsche 911 Carrera', cat: 'scale-124', price: [200, 450], cond: ProductCondition.like_new },
    
    // 1:43 Scale
    { title: 'Spark 1:43 Mercedes AMG GT', cat: 'scale-143', price: [500, 900], cond: ProductCondition.new },
    { title: 'IXO 1:43 Ford GT40 Le Mans', cat: 'scale-143', price: [400, 750], cond: ProductCondition.new },
    { title: 'Minichamps 1:43 Porsche 917K', cat: 'scale-143', price: [450, 850], cond: ProductCondition.like_new },
    
    // Vintage
    { title: 'Dinky Toys 1960s Ferrari 275 GTB', cat: 'vintage-diecast', price: [8000, 15000], cond: ProductCondition.good },
    { title: 'Corgi Toys 1965 James Bond Aston Martin', cat: 'vintage-diecast', price: [5000, 10000], cond: ProductCondition.fair },
    { title: 'Lesney Matchbox 1950s Collection', cat: 'vintage-diecast', price: [3000, 7000], cond: ProductCondition.good },
    
    // Limited Edition
    { title: 'Sınırlı Üretim GT-R Koleksiyon Seti', cat: 'limited-edition', price: [2000, 5000], cond: ProductCondition.new },
    { title: 'Collector Edition Porsche 50th Anniversary', cat: 'limited-edition', price: [3000, 6000], cond: ProductCondition.new },
    { title: 'Exclusive Ferrari F40 Signed Edition', cat: 'limited-edition', price: [5000, 10000], cond: ProductCondition.new },
    
    // Muscle Cars
    { title: 'Dodge Challenger R/T 1970 Diecast', cat: 'muscle-cars', price: [150, 350], cond: ProductCondition.new },
    { title: 'Chevrolet Camaro SS 1969 Model', cat: 'muscle-cars', price: [180, 400], cond: ProductCondition.like_new },
    { title: 'Ford Mustang Mach 1 1971', cat: 'muscle-cars', price: [200, 450], cond: ProductCondition.new },
    
    // JDM
    { title: 'Nissan Silvia S15 Spec-R Model', cat: 'jdm-legends', price: [250, 500], cond: ProductCondition.new },
    { title: 'Toyota Supra MK4 JZA80 Diecast', cat: 'jdm-legends', price: [300, 600], cond: ProductCondition.new },
    { title: 'Mitsubishi Lancer Evo IX', cat: 'jdm-legends', price: [280, 550], cond: ProductCondition.like_new },
    
    // European
    { title: 'Alfa Romeo 33 Stradale 1967', cat: 'european-classics', price: [1500, 3000], cond: ProductCondition.new },
    { title: 'Jaguar E-Type 1961 Roadster', cat: 'european-classics', price: [1200, 2500], cond: ProductCondition.like_new },
    { title: 'Mercedes-Benz 300SL Gullwing', cat: 'european-classics', price: [1800, 3500], cond: ProductCondition.new },
    
    // Trucks
    { title: 'Ford F-150 Raptor 2023 Model', cat: 'trucks-suvs', price: [150, 350], cond: ProductCondition.new },
    { title: 'Jeep Wrangler Rubicon Diecast', cat: 'trucks-suvs', price: [120, 280], cond: ProductCondition.new },
    { title: 'Toyota Land Cruiser J70 Series', cat: 'trucks-suvs', price: [200, 450], cond: ProductCondition.like_new },
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

  // Create 100+ products
  for (let i = 0; i < 120; i++) {
    const template = productTemplates[i % productTemplates.length];
    const seller = sellers[i % sellers.length];
    const category = categories.find(c => c.slug === template.cat) || categories[1];
    const price = randomPrice(template.price[0], template.price[1]);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: `${template.title} #${i + 1}`,
        description: `Kaliteli ${template.title} modeli. Koleksiyonunuz için mükemmel bir parça. Detaylı fotoğraflar için mesaj atabilirsiniz. ${i % 3 === 0 ? 'Takas yapılabilir.' : ''}`,
        price: price,
        condition: template.cond,
        status: status,
        isTradeEnabled: i % 2 === 0 || seller.displayName.includes('Premium') || seller.displayName.includes('Business'), // More products trade enabled, especially for premium/business users
        viewCount: Math.floor(Math.random() * 500),
        createdAt: randomPastDate(60),
      },
    });
    products.push(product);
  }

  console.log(`✅ Created ${products.length} products`);

  // ==========================================================================
  // 11. Create Product Images
  // ==========================================================================
  console.log('Creating product images...');

  // Try to load photos from photos folder and upload to MinIO
  const minioClient = initMinIOClient();
  const photos = loadPhotosFromFolder();
  const uploadedPhotos: Array<{ url: string; key: string; filename: string; photo: PhotoFile }> = [];
  let useRealPhotos = false;

  if (minioClient && photos.length > 0) {
    console.log(`📤 Uploading ${photos.length} photos to MinIO...`);
    
    for (const photo of photos) {
      const result = await uploadPhotoToMinIO(minioClient, photo);
      if (result) {
        uploadedPhotos.push({
          url: result.url,
          key: result.key,
          filename: photo.filename,
          photo: photo,
        });
      }
    }

    if (uploadedPhotos.length > 0) {
      useRealPhotos = true;
      console.log(`✅ Successfully uploaded ${uploadedPhotos.length} photos to MinIO`);
    } else {
      console.log('⚠️ No photos were uploaded, falling back to placeholder images');
    }
  } else {
    if (!minioClient) {
      console.log('⚠️ MinIO client not available, using placeholder images');
    }
    if (photos.length === 0) {
      console.log('⚠️ No photos found, using placeholder images');
    }
  }

  // Delete existing placeholder images if we have real photos
  // But keep real images (MinIO URLs)
  if (useRealPhotos && uploadedPhotos.length > 0) {
    await prisma.productImage.deleteMany({
      where: {
        productId: {
          in: products.map(p => p.id),
        },
        OR: [
          { url: { contains: 'via.placeholder.com' } },
          { url: { contains: 'placeholder' } },
          { minioKey: null },
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
            { minioKey: { not: null } },
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
    if (selectedPhoto) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: selectedPhoto.url,
          minioKey: selectedPhoto.key,
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
