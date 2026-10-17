import Link from "next/link";
import { type ReactNode } from "react";
import { cn } from "@tarodan/ui";

/** Tek standart metin bağlantısı — iç rota `next/link`, dış adres yeni sekmede `<a>`. */
export function TextLink({
  href,
  children,
  external,
  mono,
  title,
  className,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  mono?: boolean;
  /** İpucu metni (ör. kısaltılmış bir değerin tamamı). */
  title?: string;
  className?: string;
}) {
  const classes = cn(
    "text-primary-600 underline underline-offset-2 hover:text-primary-700",
    mono && "font-mono",
    className,
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        className={classes}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} title={title} className={classes}>
      {children}
    </Link>
  );
}
