"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import type {
  MailAreaId,
  MailAreaState,
  MailRoutingState,
} from "@/lib/api/mail-routing.types";
import { DataTable } from "@/components/DataTable";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { areaLabel } from "../_lib/mail-routing";
import { AreaFormModal } from "./AreaFormModal";

/**
 * Alanlar: her alanın müşteri postası için gönderen hesabı, görünen ad ve yanıt
 * adresi. Şablon sayısına tıklamak alanın şablon anahtarlarını satır altında açar.
 */
export function AreasTab({
  state,
  canEdit,
}: {
  state: MailRoutingState;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState<MailAreaState | null>(null);
  const [expandedId, setExpandedId] = useState<MailAreaId | null>(null);

  const columns = useMemo(() => {
    const senderOf = (area: MailAreaState) =>
      state.accounts.find((account) => account.id === area.senderAccountId)
        ?.address ?? t("admin.mailRouting.areasTab.defaultSender");

    return [
      col.text(
        t("admin.mailRouting.areasTab.columns.area"),
        (area: MailAreaState) => areaLabel(t, area.id),
        { id: "area" },
      ),
      col.text(t("admin.mailRouting.areasTab.columns.sender"), senderOf, {
        id: "sender",
      }),
      col.muted(
        t("admin.mailRouting.areasTab.columns.displayName"),
        (area: MailAreaState) => area.displayName,
        { id: "displayName" },
      ),
      col.muted(
        t("admin.mailRouting.areasTab.columns.replyTo"),
        (area: MailAreaState) => area.replyTo,
        { id: "replyTo" },
      ),
      col.custom(
        t("admin.mailRouting.areasTab.columns.templates"),
        (area: MailAreaState) =>
          area.templateKeys.length === 0 ? (
            <span className="text-sm text-muted">
              {t("admin.mailRouting.areasTab.noTemplates")}
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedId((current) =>
                  current === area.id ? null : area.id,
                )
              }
            >
              {t("admin.mailRouting.areasTab.templateCount", {
                count: area.templateKeys.length,
              })}
            </Button>
          ),
        { id: "templates" },
      ),
      ...(canEdit
        ? [
            col.rowMenu((area: MailAreaState) => [
              { label: t("common.edit"), onClick: () => setEditing(area) },
            ]),
          ]
        : []),
    ];
  }, [t, canEdit, state.accounts]);

  return (
    <SectionCard title={t("admin.mailRouting.areasTab.title")}>
      <DataTable
        dense
        columns={columns}
        data={state.areas}
        getRowId={(area) => area.id}
        expandedId={expandedId}
        renderExpanded={(area) => (
          <Panel tone="muted" padding="sm">
            <p className="mb-2 text-xs text-muted">
              {t("admin.mailRouting.areasTab.templateKeys")}
            </p>
            <ul className="space-y-1 font-mono text-xs text-body">
              {area.templateKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </Panel>
        )}
      />

      {editing && (
        <AreaFormModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          area={editing}
          accounts={state.accounts}
        />
      )}
    </SectionCard>
  );
}
