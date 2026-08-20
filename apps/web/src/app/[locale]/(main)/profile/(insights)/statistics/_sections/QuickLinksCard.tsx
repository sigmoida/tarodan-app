/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  TagIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import type { Translate } from "@/types/i18n";
import { useTranslations } from "next-intl";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const LINKS = (t: Translate): { href: string; label: string; icon: Icon }[] => [
  {
    href: "/profile/listings",
    label: t("profile.statisticsLinks.ilanlarim"),
    icon: TagIcon,
  },
  {
    href: "/profile/orders",
    label: t("profile.statisticsLinks.siparislerim"),
    icon: ShoppingBagIcon,
  },
  {
    href: "/profile/trades",
    label: t("profile.statisticsLinks.takaslarim"),
    icon: ArrowsRightLeftIcon,
  },
  {
    href: "/collections",
    label: t("profile.statisticsLinks.koleksiyonlarim"),
    icon: RectangleStackIcon,
  },
];

export default function QuickLinksCard() {
  const t = useTranslations();
  return (
    <SectionCard title={t("profile.statisticsLinks.hizliErisim")}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {LINKS(t).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-lg border border-transparent bg-surface p-4 transition-all hover:border-primary-200 hover:bg-primary-50"
          >
            <Icon className="h-5 w-5 text-muted group-hover:text-primary-500" />
            <span className="text-sm font-medium text-body group-hover:text-primary-600">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
