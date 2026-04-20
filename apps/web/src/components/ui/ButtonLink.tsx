import { Button, type ButtonProps } from '@tarodan/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface ButtonLinkProps extends Omit<ButtonProps, 'asChild'> {
  href: string;
  children: ReactNode;
}

/**
 * Web-specific: Button rendered as Next.js Link.
 * Uses @tarodan/ui Button with asChild + Next.js Link.
 */
export function ButtonLink({ href, children, ...props }: ButtonLinkProps) {
  return (
    <Button asChild {...props}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
