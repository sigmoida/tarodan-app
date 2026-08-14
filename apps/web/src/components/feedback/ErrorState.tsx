"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";

/**
 * The single error-boundary UI, shared by every `error.tsx` / `global-error.tsx`
 * so recovery looks identical everywhere. `reset()` retries the failed segment;
 * a home link is always offered. Use `fullScreen` for root/global boundaries
 * (no chrome around them) and the default padded block for segment boundaries
 * that render inside a layout (header/footer or the profile shell stay put).
 */
export default function ErrorState({
  error,
  reset,
  fullScreen = false,
  title = "Bir şeyler ters gitti",
  description = "Beklenmeyen bir hata oluştu. Tekrar deneyebilir ya da ana sayfaya dönebilirsiniz.",
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  fullScreen?: boolean;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    if (error && process.env.NODE_ENV === "development") console.error(error);
  }, [error]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
        fullScreen ? "min-h-dvh bg-surface" : "py-20"
      }`}
    >
      <p className="text-6xl font-bold text-danger-500">500</p>
      <h1 className="text-2xl font-semibold text-heading">{title}</h1>
      <p className="max-w-md text-muted">{description}</p>
      {error?.digest && (
        <p className="text-xs text-subtle">Hata kodu: {error.digest}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {reset && <Button onClick={reset}>Tekrar dene</Button>}
        <Button asChild variant="outline">
          <Link href="/">Ana sayfaya dön</Link>
        </Button>
      </div>
    </div>
  );
}
