"use client";

import { BuildingOffice2Icon, UserIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";

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
    <Tabs value={active}>
      <TabsList className="grid w-full grid-cols-2 gap-0 rounded-lg bg-surface p-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.id}
              value={item.id}
              asChild
              className="min-h-11 rounded-lg bg-transparent px-3 font-semibold text-muted shadow-none hover:bg-surface-elevated hover:text-heading data-[state=active]:!bg-primary-600 data-[state=active]:!text-inverted data-[state=active]:shadow-none"
            >
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
