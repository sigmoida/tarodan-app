import { PrismaClient, ProductStatus } from '@prisma/client';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

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

async function main() {
  console.log('🖼️  Starting to add images to all products...\n');

  // Initialize MinIO
  const minioClient = initMinIOClient();
  if (!minioClient) {
    console.error('❌ MinIO client not available. Exiting.');
    process.exit(1);
  }

  // Load photos
  const photos = loadPhotosFromFolder();
  if (photos.length === 0) {
    console.error('❌ No photos found. Exiting.');
    process.exit(1);
  }

  // Upload photos to MinIO
  console.log(`📤 Uploading ${photos.length} photos to MinIO...`);
  const uploadedPhotos: Array<{ url: string; key: string; filename: string; photo: PhotoFile }> = [];
  
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

  if (uploadedPhotos.length === 0) {
    console.error('❌ No photos were uploaded. Exiting.');
    process.exit(1);
  }

  console.log(`✅ Successfully uploaded ${uploadedPhotos.length} photos to MinIO\n`);

  // Get all products (all statuses)
  const allProducts = await prisma.product.findMany({
    include: {
      images: true,
    },
  });

  console.log(`📦 Found ${allProducts.length} active products\n`);

  let addedCount = 0;
  let replacedCount = 0;
  let skippedCount = 0;
  let roundRobinIndex = 0;

  // Process each product
  for (const product of allProducts) {
    const hasRealImage = product.images.some(img => 
      img.url && 
      !img.url.includes('placeholder') && 
      !img.url.includes('via.placeholder') &&
      (img.url.includes('localhost:9000') || img.url.includes('minio') || img.minioKey)
    );
    const hasAnyImage = product.images.length > 0;

    if (hasRealImage) {
      // Product already has real image, skip
      skippedCount++;
      continue;
    }

    // Select a random photo (round-robin if all used)
    const selectedPhoto = uploadedPhotos[roundRobinIndex % uploadedPhotos.length];
    roundRobinIndex++;

    if (hasAnyImage) {
      // Replace placeholder images
      await prisma.productImage.deleteMany({
        where: {
          productId: product.id,
        },
      });
      replacedCount++;
    } else {
      // Add new image
      addedCount++;
    }

    // Create new image
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: selectedPhoto.url,
        minioKey: selectedPhoto.key,
        sortOrder: 0,
      },
    });
  }

  console.log('\n✅ Process completed!');
  console.log(`📊 Summary:`);
  console.log(`   - Products with images added: ${addedCount}`);
  console.log(`   - Products with placeholder replaced: ${replacedCount}`);
  console.log(`   - Products skipped (already have real images): ${skippedCount}`);
  console.log(`   - Total processed: ${addedCount + replacedCount + skippedCount}`);
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
