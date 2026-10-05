import "server-only";

import { cache } from "react";
import type { PublicTimingPolicy } from "@tarodan/types";
import { getServerApiOrigin } from "@/lib/api/origin";
import { loadWebTimingPolicy } from "@/lib/timing-policy";

/**
 * Politika sürelerinin Server Component okuması (SEO/içerik sayfaları).
 *
 * Değer HTML'in içine sunucuda basılır (istemci fetch'i yok). Next fetch
 * önbelleği 5 dakikadır: admin bir süreyi değiştirince sayfalar en geç o kadar
 * sonra yenilenir; her istekte API'ye gidilmez. `cache()` aynı render içindeki
 * çağrıları tekler. API'ye ulaşılamazsa (build, kesinti) `@tarodan/shared`
 * geri düşüşü döner — sayfa süre yüzünden hata vermez.
 */
export const TIMING_POLICY_REVALIDATE_SECONDS = 300;

export const getTimingPolicy = cache((): Promise<PublicTimingPolicy> =>
  loadWebTimingPolicy(async () => {
    const response = await fetch(`${getServerApiOrigin()}/api/timing-rules`, {
      next: {
        revalidate: TIMING_POLICY_REVALIDATE_SECONDS,
        tags: ["timing-rules"],
      },
    });
    if (!response.ok) throw new Error(`timing-rules ${response.status}`);
    return response.json();
  }),
);
