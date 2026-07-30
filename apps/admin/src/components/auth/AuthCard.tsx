/** @format */

import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

/**
 * The shell for every admin auth screen (login, forgot-password).
 *
 * Mağaza tarafındaki auth ekranlarıyla AYNI tasarım: kart çerçevesi yok
 * (kenarlık / gölge / ayrı yüzey), yalnız sınırlı genişlikte sola dayalı bir
 * sütun; başlık her ekranda aynı yerde ve aynı tipografide. Eskiden admin gri
 * bir `Card` içinde, ikincil bağlantıları ortalanmış olarak duruyordu — aynı
 * ürünün iki farklı giriş tasarımı vardı.
 */
export function AuthCard({
  title,
  description,
  backHref,
  backLabel,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  /** Optional "back" link above the header (e.g. back to login). */
  backHref?: string;
  backLabel?: React.ReactNode;
  children: React.ReactNode;
  /** Optional footer row (secondary links), left-aligned with the form. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      {backHref && (
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-heading"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-heading">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted">{description}</p>
        )}
      </div>

      {children}

      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </div>
  );
}
