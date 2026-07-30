"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * Minimal auth frame for the transactional flows (forgot / reset password,
 * verify email). No two-panel hero — just the Tarodan logo up top and the form
 * (`AuthCard`) centered on the page. These screens are short, task-focused
 * detours, so they get a calm single column instead of the marketing hero used
 * on the login / register entry screens.
 */
export default function AuthMinimalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    /*
      Logo, form ve telif satırı `(centered)` çerçevesiyle AYNI sütunda ve sola
      dayalı. Eskiden logo ve telif ortalanmıştı, form ise `max-w-md` içinde
      soldan başlıyordu — aynı ürünün iki auth çerçevesi farklı hizalanıyordu.
    */
    <div className="flex min-h-screen flex-col bg-surface-elevated">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6">
        <header className="py-6">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/tarodan-logo.jpg"
              alt="Tarodan"
              width={162}
              height={40}
              className="rounded-lg object-contain"
            />
          </Link>
        </header>

        <main className="flex flex-1 items-center py-8">{children}</main>

        <footer className="py-6">
          <p className="text-sm text-subtle">
            © {new Date().getFullYear()} Tarodan. {t("footer.copyright")}
          </p>
        </footer>
      </div>
    </div>
  );
}
