"use client";

import { BuildingOffice2Icon, UserIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function RegisterAccountTabs({
  active,
}: {
  active: "individual" | "corporate";
}) {
  const t = useTranslations();
  const items = [
    {
      id: "individual" as const,
      href: "/register" as const,
      label: t("auth.individualApplication"),
      icon: UserIcon,
    },
    {
      id: "corporate" as const,
      href: "/register/business" as const,
      label: t("auth.corporateApplication"),
      icon: BuildingOffice2Icon,
    },
  ];

  return (
    <div className="grid grid-cols-2 border border-border bg-surface p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors ${
              selected
                ? "bg-primary-600 text-inverted"
                : "text-muted hover:bg-surface-elevated hover:text-heading"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
