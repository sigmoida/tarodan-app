/** @format */

import type { ComponentType, SVGProps } from "react";
import {
  TruckIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import type { Translate } from "@/types/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TradeStep {
  icon: Icon;
  title: string;
  description: string;
}

export interface TradeGuarantee {
  title: string;
  description: string;
}

export interface TradeFaq {
  q: string;
  a: string;
}

export const STEPS = (t: Translate): TradeStep[] => [
  {
    icon: ChatBubbleLeftRightIcon,
    title: t("page.secureSwap.data.takasTeklifiGonderin"),
    description: t(
      "page.secureSwap.data.ilgilendiginizBirUruneTakasTeklifiGonderin",
    ),
  },
  {
    icon: ArrowsRightLeftIcon,
    title: t("page.secureSwap.data.karsilikliOnay"),
    description: t("page.secureSwap.data.herIkiTarafDaTakasiOnayladiginda"),
  },
  {
    icon: TruckIcon,
    title: t("page.secureSwap.data.guvenliKargo"),
    description: t(
      "page.secureSwap.data.urunleriniziAnlasmaliKargoIleGonderinKargo",
    ),
  },
  {
    icon: ClipboardDocumentCheckIcon,
    title: t("page.secureSwap.data.depoKontrolu"),
    description: t(
      "page.secureSwap.data.urunleriTarodanDeposunaGonderinUzmanEkibimiz",
    ),
  },
  {
    icon: CheckCircleIcon,
    title: t("page.secureSwap.data.takasTamamlandi"),
    description: t("page.secureSwap.data.herIkiTarafDaUrunuTeslim"),
  },
];

export const GUARANTEES = (t: Translate): TradeGuarantee[] => [
  {
    title: t("page.secureSwap.data.dogrulanmisUyeler"),
    description: t("page.secureSwap.data.takasYapabilmekIcinEPostaDogrulamasi"),
  },
  {
    title: t("page.secureSwap.data.kargoTakibi"),
    description: t(
      "page.secureSwap.data.tumKargolarSistemUzerindenTakipEdilir",
    ),
  },
  {
    title: t("page.secureSwap.data.anlasmazlikCozumu"),
    description: t(
      "page.secureSwap.data.sorunYasandigindaDestekEkibimizDevreyeGirer",
    ),
  },
  {
    title: t("page.secureSwap.data.degerlendirmeSistemi"),
    description: t("page.secureSwap.data.herTakasSonrasiPuanlamaIleGuvenilir"),
  },
];

export const FAQ = (t: Translate): TradeFaq[] => [
  {
    q: t("page.secureSwap.data.takasUcretsizMi"),
    a: t("page.secureSwap.data.takasIslemlerindeUrununKomisyonKuralinaGore"),
  },
  {
    q: t("page.secureSwap.data.takasTeklifiNasilGonderilir"),
    a: t(
      "page.secureSwap.data.ilgilendiginizUrununSayfasindaTakasTeklifiGonder",
    ),
  },
  {
    q: t("page.secureSwap.data.karsiTarafTeklifiReddederseNeOlur"),
    a: t("page.secureSwap.data.hicbirYukumlulugunuzOlmazFarkliBirTeklif"),
  },
  {
    q: t("page.secureSwap.data.sorunYasarsamNeYapmaliyim"),
    a: t("page.secureSwap.data.destekEkibimizleIletisimeGecinAnlasmazlikCozum"),
  },
];
