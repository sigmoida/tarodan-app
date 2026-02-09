import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Get the storage server URL (MinIO) using the Expo host IP
 * Similar to getApiUrl but for storage (port 9000)
 */
const getStorageUrl = (): string => {
  // Expo Go'nun çalıştığı bilgisayarın IP'si
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  
  if (expoHost) {
    // Expo host IP'sini kullan - Storage port 9000
    return `http://${expoHost}:9000`;
  }
  
  // Fallback - Android emulator için 10.0.2.2, diğerleri için localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:9000';
  }
  
  return 'http://localhost:9000';
};

/**
 * Transform image URLs that use localhost:9000 to use the actual network IP
 * This is needed because mobile devices can't access localhost
 * 
 * @param url - The image URL (can be string or object with url property)
 * @returns Transformed URL string
 */
export const transformImageUrl = (url: string | { url: string } | null | undefined): string => {
  // Handle null/undefined
  if (!url) {
    return 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Ürün';
  }

  // Extract URL string from object or use directly
  const urlString = typeof url === 'string' ? url : url.url;

  // If not a string or empty, return placeholder
  if (!urlString || typeof urlString !== 'string') {
    return 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Ürün';
  }

  // If it's already a full URL with http/https and not localhost, return as is
  if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
    // Check if it contains localhost:9000 or 127.0.0.1:9000
    if (urlString.includes('localhost:9000') || urlString.includes('127.0.0.1:9000')) {
      const storageBaseUrl = getStorageUrl();
      // Replace localhost:9000 or 127.0.0.1:9000 with the actual storage URL
      return urlString.replace(/http:\/\/(localhost|127\.0\.0\.1):9000/, storageBaseUrl);
    }
    // Other URLs (placehold.co, etc.) return as is
    return urlString;
  }

  // If it's a relative path, assume it's from storage and prepend storage URL
  if (urlString.startsWith('/')) {
    const storageBaseUrl = getStorageUrl();
    return `${storageBaseUrl}${urlString}`;
  }

  // Return as is if we can't determine
  return urlString;
};

/**
 * Get image URL from images array (handles both string and object formats)
 * Similar to getImageUrl helpers but with URL transformation
 * 
 * @param images - Array of images (can be strings or objects with url property)
 * @returns First image URL or placeholder
 */
export const getImageUrl = (images: any): string => {
  if (!images || (Array.isArray(images) && images.length === 0)) {
    return 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Ürün';
  }

  const firstImage = Array.isArray(images) ? images[0] : images;
  
  if (typeof firstImage === 'string') {
    return transformImageUrl(firstImage);
  }
  
  return transformImageUrl(firstImage?.url || firstImage);
};
