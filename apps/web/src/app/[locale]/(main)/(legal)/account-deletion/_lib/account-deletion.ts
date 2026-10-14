/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";
import type { Translate } from "@/types/i18n";

/**
 * Hesap silme bilgi sayfası — metnin tek kaynağı. Google Play hesap silme
 * şartı: giriş gerektirmeyen, herkese açık bir sayfa uygulamanın adını, silme
 * adımlarını ve hangi verinin silinip hangisinin ne kadar saklandığını söyler.
 *
 * Anlatılan davranış API'deki `UserProfileService.deleteAccount` ile birebir
 * aynı olmalı (anonimleştirme, 10 yıllık kimlik arşivi, saklanan sipariş /
 * fatura kayıtları); biri değişirse diğeri de güncellenir.
 *
 * İletişim bilgileri `platform-entity.ts`ten gelir — künyenin tek kaynağı.
 */
export const accountDeletionParts = (t: Translate): LegalPart[] => [
  {
    title: t("legal.accountDeletion.howTo.title"),
    sections: [
      {
        number: "1",
        heading: t("legal.accountDeletion.howTo.appHeading"),
        blocks: [
          {
            type: "list",
            items: [
              { text: t("legal.accountDeletion.howTo.appStep1") },
              { text: t("legal.accountDeletion.howTo.appStep2") },
              { text: t("legal.accountDeletion.howTo.appStep3") },
            ],
          },
        ],
      },
      {
        number: "2",
        heading: t("legal.accountDeletion.howTo.webHeading"),
        blocks: [
          {
            type: "list",
            items: [
              { text: t("legal.accountDeletion.howTo.webStep1") },
              { text: t("legal.accountDeletion.howTo.webStep2") },
              { text: t("legal.accountDeletion.howTo.webStep3") },
            ],
          },
        ],
      },
      {
        number: "3",
        heading: t("legal.accountDeletion.howTo.beforeHeading"),
        blocks: [
          { type: "p", text: t("legal.accountDeletion.howTo.beforeText") },
          {
            type: "note",
            text: t("legal.accountDeletion.howTo.immediateNote"),
          },
        ],
      },
    ],
  },
  {
    title: t("legal.accountDeletion.data.title"),
    sections: [
      {
        number: "4",
        heading: t("legal.accountDeletion.data.deletedHeading"),
        blocks: [
          {
            type: "list",
            items: [
              { text: t("legal.accountDeletion.data.deletedProfile") },
              { text: t("legal.accountDeletion.data.deletedAccess") },
              { text: t("legal.accountDeletion.data.deletedBank") },
              { text: t("legal.accountDeletion.data.deletedListings") },
              { text: t("legal.accountDeletion.data.deletedMarketing") },
            ],
          },
        ],
      },
      {
        number: "5",
        heading: t("legal.accountDeletion.data.retainedHeading"),
        blocks: [
          {
            type: "list",
            items: [
              { text: t("legal.accountDeletion.data.retainedOrders") },
              { text: t("legal.accountDeletion.data.retainedIdentity") },
              { text: t("legal.accountDeletion.data.retainedSocial") },
              { text: t("legal.accountDeletion.data.retainedCorporate") },
            ],
          },
          {
            type: "note",
            text: t("legal.accountDeletion.data.reregisterNote"),
          },
        ],
      },
    ],
  },
  {
    title: t("legal.accountDeletion.help.title"),
    sections: [
      {
        number: "6",
        heading: t("legal.accountDeletion.help.heading"),
        blocks: [
          { type: "p", text: t("legal.accountDeletion.help.text") },
          {
            type: "fields",
            items: [
              { label: t("legal.entity.email"), value: PLATFORM_ENTITY.email },
              { label: t("legal.entity.phone"), value: PLATFORM_ENTITY.phone },
            ],
          },
        ],
      },
    ],
  },
];
