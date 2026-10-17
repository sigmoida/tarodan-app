"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslations } from "next-intl";
import { writeToClipboard } from "@/lib/clipboard";

const COPIED_MS = 1200;

/**
 * Metni panoya kopyalar; `copied` yalnız kopyalama BAŞARILI olunca kısa süre
 * `true` kalır (buton geri bildirimi). Pano API'si yoksa ya da reddederse
 * (güvensiz bağlam, izin) hata bildirimi gösterilir.
 */
export function useCopyToClipboard() {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await writeToClipboard(text);
      if (!ok) {
        toast.error(t("admin.shared.copyFailed"));
        return;
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    },
    [t],
  );

  return { copied, copy };
}
