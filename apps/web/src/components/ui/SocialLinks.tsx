/** @format */

import type { SVGProps } from "react";
// Subpath import on purpose: this component renders inside Server Components
// (the status pages), and the `@tarodan/ui` barrel would drag every client
// primitive into that chain — see apps/web/CLAUDE.md §3.
import { cn } from "@tarodan/ui/utils";

type SocialIcon = (props: SVGProps<SVGSVGElement>) => React.ReactNode;

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M7.8 2h8.4A5.81 5.81 0 0 1 22 7.8v8.4a5.81 5.81 0 0 1-5.8 5.8H7.8A5.81 5.81 0 0 1 2 16.2V7.8A5.81 5.81 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.18 0h-4.04v16.36a3.43 3.43 0 1 1-2.96-3.4V8.88a7.5 7.5 0 1 0 7 7.48V8.07A9.26 9.26 0 0 0 22.6 9.8V5.76A5.28 5.28 0 0 1 17.18 0Z" />
    </svg>
  );
}

/** Tarodan'ın sosyal medya hesapları — tek kaynak (footer + durum sayfaları). */
export const SOCIAL_ACCOUNTS = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/tarodan.com.tr/",
    icon: InstagramIcon,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/tarodan.com.tr/",
    icon: FacebookIcon,
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@tarodan.com.tr",
    icon: TikTokIcon,
  },
] satisfies Array<{ name: string; href: string; icon: SocialIcon }>;

const SIZES = {
  sm: { box: "h-9 w-9", icon: "h-5 w-5", gap: "gap-1" },
  md: { box: "h-11 w-11", icon: "h-6 w-6", gap: "gap-5" },
};

export default function SocialLinks({
  title,
  size = "md",
  className,
}: {
  title?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <div>
      {title && (
        <p className="mb-2 text-center text-sm font-medium text-body">
          {title}
        </p>
      )}
      <div className={cn("flex items-center justify-center", s.gap, className)}>
        {SOCIAL_ACCOUNTS.map((social) => {
          const Icon = social.icon;
          return (
            <a
              key={social.name}
              href={social.href}
              aria-label={social.name}
              title={social.name}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center justify-center rounded-lg text-heading transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                s.box,
              )}
            >
              <Icon className={s.icon} />
            </a>
          );
        })}
      </div>
    </div>
  );
}
