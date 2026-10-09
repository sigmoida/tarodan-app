/** @format */

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { trackAdEvent } from "@/lib/api/advertisements";

/** Gösterim sayılması için afişin görünür kalması gereken oran ve süre. */
export const IMPRESSION_VISIBLE_RATIO = 0.5;
export const IMPRESSION_VISIBLE_MS = 1000;

/**
 * Gösterim sayacı: afiş en az %50 görünür ve bu 1 sn boyunca sürerse, bu
 * bileşen ömrü (= sayfa görünümü) içinde BİR kez sayılır. Kaydırılıp geçilen ya
 * da sekme arkasında kalan afiş sayılmaz. `IntersectionObserver` yoksa (eski
 * tarayıcı) yalnız süre beklenir.
 */
export function useAdImpression(
  ref: RefObject<Element | null>,
  adId: string,
  enabled = true,
): void {
  const counted = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || counted.current) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = () => {
      if (timer || counted.current) return;
      timer = setTimeout(() => {
        counted.current = true;
        observer?.disconnect();
        trackAdEvent(adId, "impression");
      }, IMPRESSION_VISIBLE_MS);
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (
            entry?.isIntersecting &&
            entry.intersectionRatio >= IMPRESSION_VISIBLE_RATIO
          ) {
            start();
          } else {
            stop();
          }
        },
        { threshold: [0, IMPRESSION_VISIBLE_RATIO, 1] },
      );
      observer.observe(node);
    }

    return () => {
      stop();
      observer?.disconnect();
    };
  }, [ref, adId, enabled]);
}
