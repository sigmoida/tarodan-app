/** @format */

"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Accordion, Button } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { MetricCard } from "@/components/ui";
import {
  ManufacturersProvider,
  useManufacturers,
} from "./_context/ManufacturersContext";
import ManufacturersToolbar from "./_components/ManufacturersToolbar";
import ManufacturerCard from "./_components/ManufacturerCard";
import DiecastTimeline from "./_components/DiecastTimeline";
import { useTranslations } from "next-intl";

function ManufacturersLayout() {
  const t = useTranslations();
  const {
    isAuthenticated,
    searchQuery,
    clearFilters,
    brands,
    filteredBrands,
    countries,
    totalProducts,
    expandedBrand,
    setExpanded,
  } = useManufacturers();

  // Katalog boşken metrik satırı "0 Üretici · 0 Ülke · 70+ Yıllık Tarih · 0+
  // Model" yazıyordu: üç sıfır ve aralarında alakasız duran bir sabit. Sayacak
  // bir şey yoksa satırı hiç çizme.
  const hasManufacturers = brands.length > 0;
  const stats = [
    {
      value: brands.length.toString(),
      label: t("brands.manufacturersPage.uretici"),
    },
    {
      value: countries.length.toString(),
      label: t("brands.manufacturersPage.ulke"),
    },
    { value: "70+", label: t("brands.manufacturersPage.yillikTarih") },
    { value: `${totalProducts.toLocaleString("tr-TR")}+`, label: "Model" },
  ];

  return (
    <PageShell className="pb-20">
      <PageHeader
        title={t("brands.manufacturersPage.diecastUreticilerRehberi")}
        description={t(
          "brands.manufacturersPage.dunyaninEnPrestijliDiecastModelAraba",
        )}
      />

      {/* Metric cards */}
      {hasManufacturers && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <MetricCard
              key={stat.label}
              value={stat.value}
              label={stat.label}
            />
          ))}
        </div>
      )}

      {/* Search / filters */}
      {hasManufacturers && <ManufacturersToolbar />}

      {/* Accordion brand cards */}
      {filteredBrands.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-lg bg-surface-alt">
            <MagnifyingGlassIcon className="h-8 w-8 text-subtle" />
          </div>
          {/*
            "Sonuç bulunamadı" + boş tırnak ("" aramasıyla eşleşen üretici yok)
            hiç üretici GİRİLMEMİŞ olma durumunu arama sonucu sanıyordu. İki hal
            artık ayrı: aramayı temizle butonu yalnız gerçek bir arama varken.
          */}
          <h3 className="mb-1 text-lg font-bold text-heading">
            {hasManufacturers
              ? t("brands.manufacturersPage.sonucBulunamadi")
              : t("brands.manufacturersPage.ureticiListesiHazirlaniyor")}
          </h3>
          <p className="mb-4 text-sm text-muted">
            {hasManufacturers
              ? t(
                  "brands.manufacturersPage.searchqueryAramasiylaEslesenUreticiYok",
                  { searchQuery },
                )
              : t(
                  "brands.manufacturersPage.ureticilerEklendikceBuradaListelenecek",
                )}
          </p>
          {hasManufacturers && (
            <Button variant="secondary" onClick={clearFilters}>
              {t("brands.manufacturersPage.filtreleriTemizle")}
            </Button>
          )}
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          value={expandedBrand ?? ""}
          onValueChange={setExpanded}
          className="space-y-4"
        >
          {filteredBrands.map((brand) => (
            <ManufacturerCard key={brand.slug} brand={brand} />
          ))}
        </Accordion>
      )}

      {/* Timeline */}
      <DiecastTimeline />

      {/* CTA — only for logged-out visitors */}
      {!isAuthenticated && (
        <div className="relative overflow-hidden rounded-lg border border-primary-100 bg-primary-50 p-6 text-center sm:p-10">
          <div className="relative z-10">
            <h2 className="mb-3 text-2xl font-black text-heading sm:text-3xl">
              {t("brands.manufacturersPage.koleksiyonunuzuBaslatin")}
            </h2>
            <p className="mx-auto mb-6 max-w-lg text-sm text-muted sm:text-base">
              {t(
                "brands.manufacturersPage.favoriMarkalarinizdanBinlerceDiecastModelArasindan",
              )}
            </p>
            <div className="flex items-center justify-center gap-3">
              <ButtonLink variant="primary" size="md" href="/listings">
                {t("brands.manufacturersPage.ilanlariKesfet")}
              </ButtonLink>
              <ButtonLink variant="secondary" size="md" href="/register">
                {t("brands.manufacturersPage.uyeOl")}
              </ButtonLink>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function ManufacturersClient() {
  return (
    <ManufacturersProvider>
      <ManufacturersLayout />
    </ManufacturersProvider>
  );
}
