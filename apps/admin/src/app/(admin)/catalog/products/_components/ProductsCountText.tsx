"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AsyncValue, Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useListTotal } from "@/hooks/useListTotal";
import { listFilterParams } from "@/hooks/useAdminResource";
import { productFilterKeys } from "../_lib/filters";

/**
 * Page-level header subtitle — live total (respecting the active URL filters,
 * the SAME key set the list sends — `productFilterKeys` — so a new filter can't
 * be counted by the table but not by the header) +
 * the seller-filter notice. Reads state from the URL (the list syncs filters
 * there via `syncUrl`), so it lives in the page-level PageHeader, outside the
 * ResourceList/SuspenseBoundary — the header stays put while the list swaps.
 */
export function ProductsCountText() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sekme = durum; varsayılan sekme URL'ye yazılmaz → "active".
  const status = searchParams.get("tab") ?? "active";
  const search = searchParams.get("q") ?? "";
  const sellerId = searchParams.get("sellerId") ?? "";
  const filters = Object.fromEntries(
    productFilterKeys(t).map((key) => [key, searchParams.get(key) ?? ""]),
  );

  const { data: total, isLoading } = useListTotal(
    "products",
    {
      ...(status !== "ai" ? { status } : {}),
      // Liste isteğiyle AYNI parametre kuralı (boş ve "all" düşer).
      ...listFilterParams(search, filters),
    },
    adminApi.getProducts,
  );

  const removeSeller = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sellerId");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        {t.rich("admin.catalog.products.totalCount", {
          count: total ?? 0,
          value: (chunks) => (
            <AsyncValue loading={isLoading}>{chunks}</AsyncValue>
          ),
        })}
      </span>
      {sellerId && (
        <span className="inline-flex items-center gap-1">
          {t("admin.catalog.products.filteredBySeller")}
          <Button variant="ghost" size="sm" onClick={removeSeller}>
            {t("admin.catalog.products.removeFilter")}
          </Button>
        </span>
      )}
    </span>
  );
}
