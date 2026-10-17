"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import type { MailRoutingState } from "@/lib/api/mail-routing.types";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { notifiableAreas } from "../_lib/mail-routing";
import { AreaNotificationsCard } from "./AreaNotificationsCard";
import { PeopleView } from "./PeopleView";

const VIEWS = ["byArea", "byPerson"] as const;

/**
 * İç bildirimler: "Alana göre" (alıcı listesi + olay ayarları) ve "Kişiye göre"
 * (her kişi hangi alanları alıyor). Olayı olmayan alanlar burada listelenmez.
 */
export function NotificationsTab({
  state,
  canEdit,
}: {
  state: MailRoutingState;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [view, setView] = useTabParam("byArea", { param: "view" });
  const active = view === "byPerson" ? "byPerson" : "byArea";

  return (
    <div className="space-y-6">
      <Alert variant="info">
        {t("admin.mailRouting.notificationsTab.info")}
      </Alert>
      <AdminTabs
        tabs={VIEWS.map((key) => ({
          key,
          label: t(`admin.mailRouting.notificationsTab.views.${key}`),
        }))}
        value={active}
        onChange={setView}
      />
      {active === "byPerson" ? (
        <PeopleView state={state} canEdit={canEdit} />
      ) : (
        notifiableAreas(state.areas).map((area) => (
          // İçerik değişince (kayıt / başka yerden güncelleme) taslak sıfırlanır.
          <AreaNotificationsCard
            key={`${area.id}:${JSON.stringify([area.internalRecipients, area.events])}`}
            area={area}
            canEdit={canEdit}
          />
        ))
      )}
    </div>
  );
}
