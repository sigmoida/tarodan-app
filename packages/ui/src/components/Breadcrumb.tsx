import React from 'react';
import { cn } from '../lib/utils';

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Custom separator node. Default: '/' */
  separator?: React.ReactNode;
  className?: string;
  /** Render custom Link component (e.g. Next.js Link). Receives `href` and `children`. */
  linkAs?: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  separator = '/',
  className,
  linkAs,
}) => {
  const LinkComp = linkAs;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const content = isLast ? (
            <span aria-current="page" className="font-medium text-heading">
              {item.label}
            </span>
          ) : item.href && LinkComp ? (
            <LinkComp href={item.href} className="hover:text-primary-600 transition-colors">
              {item.label}
            </LinkComp>
          ) : item.href ? (
            <a
              href={item.href}
              className="hover:text-primary-600 transition-colors"
              onClick={item.onClick}
            >
              {item.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={item.onClick}
              className="hover:text-primary-600 transition-colors"
            >
              {item.label}
            </button>
          );
          return (
            <li key={i} className="flex items-center gap-1">
              {content}
              {!isLast && <span className="text-subtle" aria-hidden="true">{separator}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
