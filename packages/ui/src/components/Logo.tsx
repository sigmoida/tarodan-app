import React from 'react';
import { cn } from '../lib/utils';
import { tarodanLogoDataUri } from '../assets/tarodan-logo';

export type LogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

/**
 * The Tarodan brand logo. Self-contained via an embedded data URI, so any app
 * consuming @tarodan/ui can render it with `<Logo />` — no public/ asset or
 * bundler config, single source of truth. Size it with width/height/className.
 */
export function Logo({ alt = 'Tarodan', className, ...props }: LogoProps) {
  return (
    <img src={tarodanLogoDataUri} alt={alt} className={cn('object-contain', className)} {...props} />
  );
}
