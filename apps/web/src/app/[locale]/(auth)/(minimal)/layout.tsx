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
    <div className="flex min-h-screen flex-col bg-surface-elevated">
      <header className="flex justify-center p-6">
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

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        {children}
      </main>

      <footer className="p-6 text-center">
        <p className="text-sm text-subtle">
          © {new Date().getFullYear()} Tarodan. {t("footer.copyright")}
        </p>
      </footer>
    </div>
  );
}
