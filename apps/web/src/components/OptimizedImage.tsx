"use client";

import Image, { ImageProps } from "next/image";
import { useState, useCallback, useEffect } from "react";
import { colors as dsColors } from "@tarodan/ui";
import { logger } from "@/lib/logger";

// Default placeholder for broken images (data URL avoids external SSL / ERR_CERT_AUTHORITY_INVALID)
const DEFAULT_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="${dsColors.surface.alt}" width="400" height="400"/><text fill="${dsColors.text.muted}" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18">Image</text></svg>`,
  );

/**
 * `fill` görselleri için SON ÇARE `sizes` değeri.
 *
 * Bu bir varsayılan değil, ağ hatası önleyicidir: `sizes` verilmemiş bir `fill`
 * görselinde Next uyarı basar ve tarayıcı en büyük varyantı indirir. Buradaki
 * değer "telefonda tam ekran" varsayar — iki sütunlu bir ızgarada bu, gerekenin
 * iki katı çözünürlük demektir.
 *
 * Bu yüzden her çağrı KENDİ `sizes`'ını vermeli; tekrarlanan ızgara düzenleri
 * için hazır değerler `@/lib/imageSizes`'ta.
 */
const DEFAULT_FILL_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw";

/**
 * Validate that a string is a valid image src for Next.js Image component.
 * Accepts: http(s) URLs, absolute paths (/...), data URIs, blob URIs.
 * Rejects: bare S3 keys like "dev/products/..." which crash Next.js Image.
 */
export function isValidImageSrc(src: unknown): boolean {
  if (!src || typeof src !== "string") return false;
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/") ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  );
}

interface OptimizedImageProps extends Omit<ImageProps, "onError"> {
  fallbackSrc?: string;
  logContext?: Record<string, unknown>;
  /** Override default sizes when using fill. Improves LCP and reduces bandwidth. */
  sizes?: string;
  /** Lazy load below-fold images */
  loading?: "lazy" | "eager";
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

  // Picsum random photos are irrelevant for products; show placeholder with product title (alt) instead
  const replacePicsumWithPlaceholder = (s: string): string => {
    if (typeof s !== "string" || !s.includes("picsum.photos")) return s;
    const text =
      alt && typeof alt === "string" ? alt.substring(0, 25).trim() : "Ürün";
    return `https://placehold.co/800x600?text=${encodeURIComponent(text)}`;
  };
  const srcReplaced =
    typeof src === "string" ? replacePicsumWithPlaceholder(src) : src;
  // Validate src before passing to Next.js Image — bare S3 keys crash rendering
  const safeSrc =
    typeof srcReplaced === "string" && !isValidImageSrc(srcReplaced)
      ? fallbackSrc
      : srcReplaced;

  // DiceBear and other SVG/external avatars: use unoptimized to avoid optimizer path and preserve aspect ratio
  const isExternalAvatar =
    typeof safeSrc === "string" &&
    (safeSrc.includes("dicebear.com") || safeSrc.includes("api.dicebear.com"));
  // Placeholder services: load directly to avoid Next.js optimizer truncating long query strings or failing
  const isPlaceholderService =
    typeof safeSrc === "string" &&
    (safeSrc.includes("placehold.co") ||
      safeSrc.includes("via.placeholder.com") ||
      safeSrc.includes("picsum.photos"));
  // S3 product/collection images: already WebP + cache headers; load directly to avoid Next.js proxy (403 when bucket not public)
  const isS3ProductOrCollection =
    typeof safeSrc === "string" &&
    (safeSrc.includes("amzn-tarodan.s3.") ||
      (safeSrc.includes(".s3.") &&
        (safeSrc.includes("/products/") || safeSrc.includes("/collections/"))));
  const useUnoptimized =
    props.unoptimized ??
    (isExternalAvatar || isPlaceholderService || isS3ProductOrCollection);

  const [imgSrc, setImgSrc] = useState(safeSrc);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Sync state when src prop changes
  useEffect(() => {
    const replaced =
      typeof src === "string" ? replacePicsumWithPlaceholder(src) : src;
    const validated =
      typeof replaced === "string" && !isValidImageSrc(replaced)
        ? fallbackSrc
        : replaced;
    setImgSrc(validated);
    setHasError(false);
    setRetryCount(0);
  }, [src, fallbackSrc, alt]);

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
    if (process.env.NODE_ENV === "development") {
      console.group("🖼️ OptimizedImage Error");
      console.error("Image failed to load:", errorDetails);
      console.groupEnd();
    }

    // Production & Development: Log to Sentry
    logger.warn("Image load failed", {
      component: "OptimizedImage",
      errorType: "image_load_failure",
      ...errorDetails,
    });

    // Switch to fallback
    if (!hasError) {
      setHasError(true);
      setImgSrc(fallbackSrc);
      setRetryCount((prev) => prev + 1);
    }
  }, [src, imgSrc, fallbackSrc, alt, retryCount, hasError, logContext]);

  const handleLoad = useCallback(() => {
    // Log successful loads in development for monitoring
    if (process.env.NODE_ENV === "development" && hasError) {
      console.log("🖼️ OptimizedImage: Fallback loaded successfully", {
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
      loading={props.loading}
    />
  );
}

export type ImageUrlSource =
  | string
  | {
      url?: string;
      cardUrl?: string;
      detailUrl?: string;
      id?: string;
      sortOrder?: number;
    }
  | null
  | undefined;

/**
 * Get image URL from various formats. Supports cardUrl/detailUrl for product images.
 * @param variant 'card' for card/listing context, 'detail' for gallery/detail context
 */
export function getOptimizedImageUrl(
  image: ImageUrlSource,
  placeholder: string = DEFAULT_PLACEHOLDER,
  productTitle?: string,
  variant?: "card" | "detail",
): string {
  if (!image) return placeholder;
  let raw: string | null = null;
  if (typeof image === "string") {
    raw = image;
  } else if (image && typeof image === "object") {
    if (variant === "detail" && "detailUrl" in image && image.detailUrl) {
      raw = image.detailUrl;
    } else if (variant === "card" && "cardUrl" in image && image.cardUrl) {
      raw = image.cardUrl;
    } else if ("cardUrl" in image && image.cardUrl) {
      raw = image.cardUrl;
    } else if ("detailUrl" in image && image.detailUrl) {
      raw = image.detailUrl;
    } else if ("url" in image && image.url) {
      raw = image.url;
    }
  }
  if (raw && raw.includes("picsum.photos") && productTitle) {
    raw = `https://placehold.co/800x600?text=${encodeURIComponent(productTitle.substring(0, 25).trim())}`;
  }
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
  context?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "development") {
    console.log(`🖼️ Image loaded in ${loadTime}ms:`, imageSrc);
  }

  // Track in Sentry for performance monitoring
  logger.info(`Image loaded: ${imageSrc}`, {
    loadTimeMs: loadTime,
    ...context,
  });
}
