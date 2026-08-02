"use client";

import Link from "next/link";
import Image from "next/image";
import { SidebarContent } from "./SidebarContent";

/**
 * The left navigation column on `lg+`.
 *
 * Küçük ekranda hiç render EDİLMEZ — orada `SidebarNavDrawer` devreye girer.
 * Eskiden aynı `aside` ekran dışına kaydırılıp elle çizilmiş bir karartma
 * katmanıyla açılıyordu: odak tuzağı, Escape ve gövde kaydırma kilidi yoktu.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-navigation hidden w-64 flex-col bg-surface-elevated shadow-soft lg:flex">
      <div className="flex h-16 items-center bg-primary-500 px-4">
        <Link
          href="/dashboard"
          scroll={false}
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
      </div>

      <SidebarContent />
    </aside>
  );
}
