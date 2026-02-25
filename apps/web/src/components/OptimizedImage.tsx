'use client';

import Image, { ImageProps } from 'next/image';
import { useState, useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Default placeholder for broken images (data URL avoids external SSL / ERR_CERT_AUTHORITY_INVALID)
const DEFAULT_PLACEHOLDER =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#f3f4f6" width="400" height="400"/><text fill="#9ca3af" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18">Image</text></svg>');

/** Default sizes for fill images: responsive grid (e.g. 3 cols desktop, 2 tablet, 1 mobile) */
const DEFAULT_FILL_SIZES = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';

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
  const [imgSrc, setImgSrc] = useState(src);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Sync state when src prop changes
  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
    setRetryCount(0);
  }, [src]);

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
  if (typeof image === 'string') return image;
  if ('url' in image && image.url) return image.url;
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
