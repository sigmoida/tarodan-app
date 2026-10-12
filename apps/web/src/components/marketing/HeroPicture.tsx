/** @format */

import Image, { getImageProps } from "next/image";
import { isOptimizableImage } from "@/lib/imageHosts";

/** Masaüstü görselinin devreye girdiği genişlik (Tailwind `md`). */
const DESKTOP_MEDIA = "(min-width: 768px)";

interface HeroPictureProps {
  imageUrl: string;
  /** Verilirse dar ekranda bu görsel yüklenir; yoksa `imageUrl` her yerde. */
  mobileImageUrl?: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/**
 * Hero görseli (kapsayıcıyı doldurur — üst öğe `relative` olmalı). Mobil görsel
 * varsa `<picture>` ile sanat yönetimi yapılır: tarayıcı yalnız eşleşen
 * `<source>`u indirir, yani görünüm başına TEK istek. Panelden gelen adres
 * `next.config.js`teki izinli sunucudaysa optimize edilir, değilse olduğu gibi.
 */
export default function HeroPicture({
  imageUrl,
  mobileImageUrl,
  alt,
  sizes,
  priority,
  className,
}: HeroPictureProps) {
  const base = { alt, fill: true, sizes, priority, quality: 90, className };
  const imageProps = (src: string) =>
    getImageProps({ ...base, src, unoptimized: !isOptimizableImage(src) })
      .props;

  if (!mobileImageUrl || mobileImageUrl === imageUrl) {
    return (
      <Image
        {...base}
        src={imageUrl}
        unoptimized={!isOptimizableImage(imageUrl)}
      />
    );
  }

  const desktop = imageProps(imageUrl);
  const { srcSet: mobileSrcSet, ...mobile } = imageProps(mobileImageUrl);
  return (
    <picture>
      <source
        media={DESKTOP_MEDIA}
        srcSet={desktop.srcSet ?? String(desktop.src)}
        sizes={sizes}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps çıktısı */}
      <img {...mobile} srcSet={mobileSrcSet} alt={alt} />
    </picture>
  );
}
