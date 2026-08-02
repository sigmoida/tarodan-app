/** @format */

import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Layout for unauthenticated pages (login, forgot-password). Pure passthrough —
 * a primary header with the brand on the left + a constrained form column below.
 *
 * The "already logged in → /dashboard" bounce used to live here as an
 * `await getSession()` redirect. That made this an async layout that suspended
 * on a network call, and after login the Server Action revalidates /login and
 * re-runs it — flashing a blank frame before landing on /dashboard (same issue
 * web had). The bounce now happens at the edge in `middleware.ts`
 * (guestOnlyPaths), before render and only on real navigations.
 *
 * Async (like the root layout) so the footer copyright line can come from the
 * request-resolved locale via `getTranslations`.
 *
 * Yüzey ve hizalama mağaza tarafındaki auth ekranlarıyla aynı: düz yükseltilmiş
 * zemin (gradyan yok) ve telif satırı forma dayalı, ortalanmamış. Logo da
 * mağaza başlığındakiyle AYNI varlık ve AYNI ölçüde (saydam PNG, 32px).
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-screen flex-col bg-surface-elevated">
      <header className="flex h-16 items-center bg-primary-500 px-6 shadow-sm">
        <Link
          href="/login"
          className="flex h-8 flex-shrink-0 items-center transition-opacity hover:opacity-90"
        >
          <Image
            src="/tarodan-logo-transparent.png"
            alt="Tarodan Logo"
            width={120}
            height={38}
            className="object-contain max-h-8 w-auto"
            priority
          />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          {children}

          {/* Mağaza tarafıyla AYNI satır ve AYNI anahtar. Admin'in kendi
              anahtarı yılı METİNE gömüyordu ("© 2026 …") — sessizce eskiyen
              bir sabit — ve marka adı da farklıydı ("Tarodan Marketplace"). */}
          <p className="mt-10 text-sm text-subtle">
            © {new Date().getFullYear()} Tarodan. {t("footer.copyright")}
          </p>
        </div>
      </main>
    </div>
  );
}
