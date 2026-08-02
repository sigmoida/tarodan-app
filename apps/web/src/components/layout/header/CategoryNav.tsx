/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useNavCatalog } from "./_hooks/useNavCatalog";
import CategoriesPanel from "./nav/CategoriesPanel";
import ScalesPanel from "./nav/ScalesPanel";

const NAV_LINK_CLASS =
  "whitespace-nowrap px-3 py-2 text-sm font-medium text-body hover:text-heading hover:bg-surface-elevated transition-colors rounded";
const NAV_TRIGGER_CLASS =
  "text-body hover:text-heading hover:bg-surface-elevated data-[state=open]:bg-surface-elevated data-[state=open]:text-heading";

export default function CategoryNav() {
  const t = useTranslations();
  const {
    categories,
    manufacturers,
    scales,
    navItems: items,
  } = useNavCatalog();

  const vehicleTypes = categories.map((c) => ({ label: c.name, slug: c.slug }));

  return (
    <NavigationMenu viewport={false} className="w-full max-w-none">
      <NavigationMenuList className="h-12 justify-start gap-2">
        {items.map((item) => (
          <NavigationMenuItem key={item.label}>
            {item.href ? (
              <NavigationMenuLink asChild>
                <Link href={item.href} className={NAV_LINK_CLASS}>
                  {item.label}
                </Link>
              </NavigationMenuLink>
            ) : (
              <>
                <NavigationMenuTrigger className={NAV_TRIGGER_CLASS}>
                  {item.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="absolute left-0 top-full mt-1.5 z-50 w-full md:w-full data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
                  {item.dropdown === "categories" ? (
                    <CategoriesPanel
                      vehicleTypes={vehicleTypes}
                      manufacturers={manufacturers}
                    />
                  ) : (
                    <ScalesPanel title={t("product.scale")} scales={scales} />
                  )}
                </NavigationMenuContent>
              </>
            )}
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
