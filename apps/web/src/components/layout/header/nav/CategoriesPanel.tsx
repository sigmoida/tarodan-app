/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { NavigationMenuLink } from "@tarodan/ui";
import { groupManufacturers, navHref, type ManufacturerRef } from "./config";
import NavPanel from "./NavPanel";

interface VehicleType {
  label: string;
  slug: string;
}

/**
 * "Kategoriler" mega-paneli: solda araç türleri, sağda popüler üreticiler.
 *
 * Sütunlar EŞİT genişlikte değil. Araç türü bir avuç kayıttır, üretici listesi
 * ise onlarca; eşit bölünce sol sütun yarım panel boyunca boş kalıyor, üretici
 * sütunu da gereksiz yere dar kalıp satır satır sarıyordu.
 *
 * Üretici listesi `groupManufacturers` ile ilan sayısına göre kırpılır — panel
 * artık ekran boyuna sığar; tam listeye alttaki bağlantı götürür.
 */
export default function CategoriesPanel({
  vehicleTypes,
  manufacturers,
}: {
  vehicleTypes: VehicleType[];
  manufacturers: ManufacturerRef[];
}) {
  const t = useTranslations();
  const groups = groupManufacturers(manufacturers);

  return (
    <NavPanel>
      <div className="grid gap-8 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        {/* Vehicle types */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("nav.vehicleTypes")}
          </h3>
          <div className="flex flex-col gap-y-1">
            {vehicleTypes.map((type) => (
              <NavigationMenuLink asChild key={type.slug}>
                <Link
                  href={navHref.vehicleType(type.slug)}
                  className="py-1 text-sm text-muted transition-colors hover:text-primary-600"
                >
                  {type.label}
                </Link>
              </NavigationMenuLink>
            ))}
          </div>
        </div>

        {/* Manufacturers */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("nav.manufacturers")}
          </h3>
          <div className="space-y-2.5">
            {groups.map((group) => (
              <div key={group.range}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-subtle">
                  {group.range}
                </p>
                <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                  {group.items.map((item, idx) => (
                    <span key={item.id} className="inline-flex">
                      <NavigationMenuLink asChild>
                        <Link
                          href={navHref.manufacturer(item)}
                          className="text-sm text-muted transition-colors hover:text-primary-600"
                        >
                          {item.name}
                        </Link>
                      </NavigationMenuLink>
                      {idx < group.items.length - 1 && (
                        <span className="mx-1 text-border-strong">·</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <NavigationMenuLink asChild>
              <Link
                href={navHref.allManufacturers}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-500 transition-colors hover:text-primary-600"
              >
                {t("nav.allManufacturers")}
                {manufacturers.length > 0 && (
                  <span className="font-normal text-subtle">
                    ({manufacturers.length})
                  </span>
                )}
              </Link>
            </NavigationMenuLink>
          </div>
        </div>
      </div>
    </NavPanel>
  );
}
