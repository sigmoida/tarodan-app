import { getOptimizedImageUrl } from "@/components/OptimizedImage";
import { DEMO_PRODUCT_IMAGES } from "./constants";

export const getImageUrl = (
  image: any,
  index?: number,
  productTitle?: string,
): string => {
  const demoIdx =
    (index ?? Math.floor(Math.random() * DEMO_PRODUCT_IMAGES.length)) %
    DEMO_PRODUCT_IMAGES.length;
  const placeholder = DEMO_PRODUCT_IMAGES[demoIdx];
  return getOptimizedImageUrl(image, placeholder, productTitle, "card");
};
