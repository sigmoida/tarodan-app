"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@tarodan/ui";
import type { MailRoutingState } from "@/lib/api/mail-routing.types";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { useConfirm } from "@/provider/ConfirmProvider";
import {
  areaLabel,
  planPersonChange,
  recipientsByPerson,
  type PersonRow,
} from "../_lib/mail-routing";
import { usePersonChange } from "../_lib/useMailRoutingPage";
import { PersonFormModal } from "./PersonFormModal";

type Modal = { person?: PersonRow } | null;

/**
 * "Kişiye göre": her tekil alıcı adresi ve aldığı alanlar. Bir kişiyi birkaç
 * alana birden eklemek / çıkarmak için buradan düzenlenir.
 */
export function PeopleView({
  state,
  canEdit,
}: {
  state: MailRoutingState;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<Modal>(null);
  const people = useMemo(() => recipientsByPerson(state.areas), [state.areas]);
  const remove = usePersonChange();

  const columns = useMemo(
    () => [
      col.text(
        t("admin.mailRouting.people.columns.person"),
        (p: PersonRow) => p.address,
        { id: "person" },
      ),
      col.custom(
        t("admin.mailRouting.people.columns.areas"),
        (p: PersonRow) => (
          <div className="flex flex-wrap gap-1">
            {p.areaIds.map((id) => (
              <Badge key={id} variant="outline">
                {areaLabel(t, id)}
              </Badge>
            ))}
          </div>
        ),
        { id: "areas", minWidth: 280, grow: 5 },
      ),
      ...(canEdit
        ? [
            col.rowMenu((p: PersonRow) => [
              {
                label: t("common.edit"),
                onClick: () => setModal({ person: p }),
              },
              {
                label: t("admin.mailRouting.people.removeAll"),
                destructive: true,
                onClick: () => {
                  void confirm({
                    title: t("admin.mailRouting.people.removeTitle"),
                    description: t("admin.mailRouting.people.removeDescription", {
                      address: p.address,
                    }),
                    destructive: true,
                    onConfirm: () =>
                      remove.mutateAsync(
                        planPersonChange(state.areas, p.address, []),
                      ),
                  });
                },
              },
            ]),
          ]
        : []),
    ],
    [t, canEdit, confirm, remove, state.areas],
  );

  return (
    <SectionCard
      title={t("admin.mailRouting.people.title")}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setModal({})}>
            {t("admin.mailRouting.people.add")}
          </Button>
        )
      }
    >
      <DataTable
        dense
        columns={columns}
        data={people}
        getRowId={(p) => p.address}
        emptyText={t("admin.mailRouting.people.empty")}
      />
      {modal && (
        <PersonFormModal
          key={modal.person?.address ?? "new"}
          open
          onClose={() => setModal(null)}
          areas={state.areas}
          person={modal.person}
        />
      )}
    </SectionCard>
  );
}
