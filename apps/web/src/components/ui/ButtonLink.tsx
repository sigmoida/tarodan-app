import { Button, type ButtonProps } from "@tarodan/ui";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

interface ButtonLinkProps extends Omit<ButtonProps, "asChild"> {
  href: string;
  children: ReactNode;
  /**
   * Site dışı mutlak adres. Locale-aware `Link` böyle bir hedefi kendi
   * öneki ile birleştirip `/tr/https://…` üretiyor; dış link düz `<a>`
   * olmalı.
   */
  external?: boolean;
}

/**
 * Web-specific: Button rendered as Next.js Link.
 * Uses @tarodan/ui Button with asChild + Next.js Link.
 */
export function ButtonLink({
  href,
  children,
  external = false,
  ...props
}: ButtonLinkProps) {
  return (
    <Button asChild {...props}>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <Link href={href}>{children}</Link>
      )}
    </Button>
  );
}
