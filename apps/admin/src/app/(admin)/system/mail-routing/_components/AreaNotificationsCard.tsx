"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Select, Toggle } from "@tarodan/ui";
import type { MailAreaState } from "@/lib/api/mail-routing.types";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import {
  areaLabel,
  deliveryOptions,
  eventLabel,
  notificationUpdate,
  setEventDelivery,
  setEventEnabled,
  toNotificationDraft,
} from "../_lib/mail-routing";
import { useAreaUpdate } from "../_lib/useMailRoutingPage";
import { RecipientEditor } from "./RecipientEditor";

/**
 * Bir alanın iç bildirimleri: alıcı listesi + olay başına açık/kapalı ve teslim
 * şekli (anlık / saatlik / günlük özet). Taslak yerelde tutulur; Kaydet yalnız
 * DEĞİŞENi gönderir. Üst bileşen alanın içeriği değişince `key` ile yeniden kurar.
 */
export function AreaNotificationsCard({
  area,
  canEdit,
}: {
  area: MailAreaState;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState(() => toNotificationDraft(area));
  const save = useAreaUpdate();
  const update = notificationUpdate(draft, area);

  return (
    <SectionCard
      title={areaLabel(t, area.id)}
      actions={
        canEdit && (
          <Button
            size="sm"
            disabled={!update}
            isLoading={save.isPending}
            onClick={() => update && save.mutate({ areaId: area.id, update })}
          >
            {t("common.save")}
          </Button>
        )
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <SectionTitle as="h4" size="sm">
            {t("admin.mailRouting.notificationsTab.recipients")}
          </SectionTitle>
          <RecipientEditor
            value={draft.internalRecipients}
            canEdit={canEdit}
            onChange={(internalRecipients) =>
              setDraft((current) => ({ ...current, internalRecipients }))
            }
          />
        </div>

        <div className="space-y-2">
          <SectionTitle as="h4" size="sm">
            {t("admin.mailRouting.notificationsTab.events")}
          </SectionTitle>
          {draft.events.map((event) => (
            <Panel
              key={event.id}
              padding="sm"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Toggle
                  checked={event.enabled}
                  disabled={!canEdit}
                  label={eventLabel(t, event.id)}
                  onChange={(enabled) =>
                    setDraft((current) =>
                      setEventEnabled(current, event.id, enabled),
                    )
                  }
                />
                <span className="text-sm text-heading">
                  {eventLabel(t, event.id)}
                </span>
              </div>
              <div className="sm:w-48">
                <Select
                  bare
                  aria-label={t("admin.mailRouting.notificationsTab.delivery")}
                  value={event.delivery}
                  disabled={!canEdit || !event.enabled}
                  options={deliveryOptions(t)}
                  onChange={(changeEvent) =>
                    setDraft((current) =>
                      setEventDelivery(
                        current,
                        event.id,
                        changeEvent.target.value as typeof event.delivery,
                      ),
                    )
                  }
                />
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
