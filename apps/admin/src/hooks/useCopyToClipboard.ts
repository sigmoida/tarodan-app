"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COPIED_MS = 1200;

/**
 * Metni panoya kopyalar; `copied` kısa süre `true` kalır (buton geri bildirimi).
 * Pano API'si yoksa (eski tarayıcı / güvensiz bağlam) sessizce hiçbir şey yapmaz.
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback((text: string) => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, []);

  return { copied, copy };
}
