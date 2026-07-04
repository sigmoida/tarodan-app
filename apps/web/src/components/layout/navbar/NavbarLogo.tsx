'use client';

import Link from 'next/link';
import Image from 'next/image';

/**
 * The storefront logo. Uses the transparent PNG asset (distinct from the shared
 * `@tarodan/ui` Logo) because it sits on the colored primary bar.
 */
export default function NavbarLogo() {
  return (
    <Link href="/" className="flex-shrink-0 flex items-center hover:opacity-90 transition-opacity h-8">
      <Image
        src="/tarodan-logo-transparent.png"
        alt="Tarodan Logo"
        width={120}
        height={38}
        className="object-contain max-h-8 w-auto"
        priority
      />
    </Link>
  );
}
