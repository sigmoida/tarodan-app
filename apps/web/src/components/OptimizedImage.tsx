'use client';

import Image, { ImageProps } from 'next/image';
import { useState, useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Default placeholder for broken images (data URL avoids external SSL / ERR_CERT_AUTHORITY_INVALID)
const DEFAULT_PLACEHOLDER =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#f3f4f6" width="400" height="400"/><text fill="#9ca3af" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18">Image</text></svg>');

/** Default sizes for fill images: responsive grid (e.g. 3 cols desktop, 2 tablet, 1 mobile) */
const DEFAULT_FILL_SIZES = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';

/**
 * Validate that a string is a valid image src for Next.js Image component.
 * Accepts: http(s) URLs, absolute paths (/...), data URIs, blob URIs.
 * Rejects: bare S3 keys like "dev/products/..." which crash Next.js Image.
 */
export function isValidImageSrc(src: unknown): boolean {
  if (!src || typeof src !== 'string') return false;
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('/') ||
    src.startsWith('data:') ||
    src.startsWith('blob:')
  );
}

interface OptimizedImageProps extends Omit<ImageProps, 'onError'> {
  fallbackSrc?: string;
  logContext?: Record<string, unknown>;
  /** Override default sizes when using fill. Improves LCP and reduces bandwidth. */
  sizes?: string;
}

/**
 * OptimizedImage Component
 * 
 * Next.js Image wrapper with:
 * - Automatic optimization (no unoptimized flag)
 * - Error handling with Sentry logging
 * - Fallback image support
 * - Development console logging
 * 
 * Usage:
 * <OptimizedImage
 *   src={imageUrl}
 *   alt="Description"
 *   fill
 *   fallbackSrc="/placeholder.jpg"
 *   logContext={{ productId: '123', page: 'listing' }}
 * />
 */
export default function OptimizedImage({
  src,
  alt,
  fallbackSrc = DEFAULT_PLACEHOLDER,
  logContext = {},
  className,
  sizes,
  ...props
}: OptimizedImageProps) {
  // When using fill, Next.js requires "sizes" for optimal srcset. Apply default if missing.
  const effectiveSizes = props.fill && !sizes ? DEFAULT_FILL_SIZES : sizes;

  // Validate src before passing to Next.js Image — bare S3 keys crash rendering
  const safeSrc = (typeof src === 'string' && !isValidImageSrc(src)) ? fallbackSrc : src;

  // DiceBear and other SVG/external avatars: use unoptimized to avoid optimizer path and preserve aspect ratio
  const isExternalAvatar =
    typeof safeSrc === 'string' &&
    (safeSrc.includes('dicebear.com') || safeSrc.includes('api.dicebear.com'));
  const useUnoptimized = props.unoptimized ?? isExternalAvatar;

  const [imgSrc, setImgSrc] = useState(safeSrc);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Sync state when src prop changes
  useEffect(() => {
    const validated = (typeof src === 'string' && !isValidImageSrc(src)) ? fallbackSrc : src;
    setImgSrc(validated);
    setHasError(false);
    setRetryCount(0);
  }, [src, fallbackSrc]);

  const handleError = useCallback(() => {
    const errorDetails = {
      originalSrc: src,
      currentSrc: imgSrc,
      fallbackSrc,
      alt,
      retryCount,
      timestamp: new Date().toISOString(),
      ...logContext,
    };

    // Development: Console log for easy debugging
    if (process.env.NODE_ENV === 'development') {
      console.group('🖼️ OptimizedImage Error');
      console.error('Image failed to load:', errorDetails);
      console.groupEnd();
    }

    // Production & Development: Log to Sentry
    Sentry.captureMessage('Image load failed', {
      level: 'warning',
      tags: {
        component: 'OptimizedImage',
        errorType: 'image_load_failure',
      },
      extra: errorDetails,
    });

    // Track metrics for monitoring
    Sentry.addBreadcrumb({
      category: 'image',
      message: `Image failed: ${typeof src === 'string' ? src : 'StaticImport'}`,
      level: 'warning',
      data: errorDetails,
    });

    // Switch to fallback
    if (!hasError) {
      setHasError(true);
      setImgSrc(fallbackSrc);
      setRetryCount(prev => prev + 1);
    }
  }, [src, imgSrc, fallbackSrc, alt, retryCount, hasError, logContext]);

  const handleLoad = useCallback(() => {
    // Log successful loads in development for monitoring
    if (process.env.NODE_ENV === 'development' && hasError) {
      console.log('🖼️ OptimizedImage: Fallback loaded successfully', {
        fallbackSrc,
        originalSrc: src,
      });
    }
  }, [hasError, fallbackSrc, src]);

  return (
    <Image
      {...props}
      src={imgSrc}
      alt={alt}
      className={className}
      sizes={effectiveSizes}
      onError={handleError}
      onLoad={handleLoad}
      unoptimized={useUnoptimized}
    />
  );
}

/**
 * Helper function to get image URL from various formats
 * Used across the app for consistent image URL handling
 */
export function getOptimizedImageUrl(
  image: string | { url: string } | { id?: string; url: string; sortOrder?: number } | null | undefined,
  placeholder: string = DEFAULT_PLACEHOLDER
): string {
  if (!image) return placeholder;
  const raw = typeof image === 'string' ? image : ('url' in image ? image.url : null);
  if (raw && isValidImageSrc(raw)) return raw;
  return placeholder;
}

/**
 * Log image performance metrics
 * Call this to track image loading performance
 */
export function logImagePerformance(
  imageSrc: string,
  loadTime: number,
  context?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🖼️ Image loaded in ${loadTime}ms:`, imageSrc);
  }

  // Track in Sentry for performance monitoring
  Sentry.addBreadcrumb({
    category: 'performance',
    message: `Image loaded: ${imageSrc}`,
    level: 'info',
    data: {
      loadTimeMs: loadTime,
      ...context,
    },
  });
}
