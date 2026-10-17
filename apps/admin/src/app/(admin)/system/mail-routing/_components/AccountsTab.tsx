"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import type {
  MailRoutingState,
  MailSenderAccountView,
} from "@/lib/api/mail-routing.types";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { areaLabel, testStatus } from "../_lib/mail-routing";
import { MAIL_ROUTING_RESOURCE } from "../_lib/useMailRoutingPage";
import { AccountFormModal } from "./AccountFormModal";
import { AccountTestModal } from "./AccountTestModal";

type Modal =
  | { kind: "form"; account?: MailSenderAccountView }
  | { kind: "test"; account: MailSenderAccountView }
  | null;

/** Gönderen hesaplar: ekle / düzenle / sil / test gönder. */
export function AccountsTab({
  state,
  canEdit,
}: {
  state: MailRoutingState;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);

  // 409 (hesap hâlâ bir alanda kullanımda) mesajını kapanmayan onay
  // penceresinin yanında useAdminMutation'ın hata bildirimi gösterir.
  const del = useAdminMutation((id: string) => adminApi.deleteMailAccount(id), {
    invalidates: [MAIL_ROUTING_RESOURCE],
    successMessage: t("admin.mailRouting.accountsTab.deleted"),
  });

  const columns = useMemo(
    () => [
      col.text(
        t("admin.mailRouting.accountsTab.columns.address"),
        (a: MailSenderAccountView) => a.address,
        { id: "address" },
      ),
      col.muted(
        t("admin.mailRouting.accountsTab.columns.displayName"),
        (a: MailSenderAccountView) => a.displayName,
        { id: "displayName" },
      ),
      col.custom(
        t("admin.mailRouting.accountsTab.columns.areas"),
        (a: MailSenderAccountView) =>
          a.usedByAreas.length === 0 ? (
            <span className="text-sm text-muted">
              {t("admin.mailRouting.accountsTab.noAreas")}
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {a.usedByAreas.map((id) => (
                <Badge key={id} variant="outline">
                  {areaLabel(t, id)}
                </Badge>
              ))}
            </div>
          ),
        { id: "areas", minWidth: 240, grow: 3 },
      ),
      col.custom(
        t("admin.mailRouting.accountsTab.columns.lastTest"),
        (a: MailSenderAccountView) => {
          const status = testStatus(a);
          if (!status) {
            return (
              <span className="text-sm text-muted">
                {t("admin.mailRouting.accountsTab.notTested")}
              </span>
            );
          }
          return (
            <div className="min-w-0">
              <Badge variant={status === "ok" ? "success" : "danger"}>
                {t(`admin.mailRouting.accountsTab.test.badge.${status}`)}
              </Badge>
              {status === "failed" && a.lastTestError && (
                <p className="mt-1 text-xs text-danger-700">
                  {a.lastTestError}
                </p>
              )}
            </div>
          );
        },
        { id: "lastTest", minWidth: 220, grow: 3 },
      ),
      col.badge(
        t("admin.mailRouting.accountsTab.columns.password"),
        (a: MailSenderAccountView) => (
          <Badge variant={a.hasPassword ? "success" : "warning"}>
            {a.hasPassword
              ? t("admin.mailRouting.accountsTab.passwordSet")
              : t("admin.mailRouting.accountsTab.passwordMissing")}
          </Badge>
        ),
        { id: "password" },
      ),
      ...(canEdit
        ? [
            col.rowMenu((a: MailSenderAccountView) => [
              {
                label: t("admin.mailRouting.accountsTab.testSend"),
                onClick: () => setModal({ kind: "test", account: a }),
              },
              {
                label: t("common.edit"),
                onClick: () => setModal({ kind: "form", account: a }),
              },
              {
                label: t("common.delete"),
                destructive: true,
                onClick: () => {
                  void confirm({
                    title: t("admin.mailRouting.accountsTab.deleteTitle"),
                    description: t(
                      "admin.mailRouting.accountsTab.deleteDescription",
                      { address: a.address },
                    ),
                    destructive: true,
                    onConfirm: () => del.mutateAsync(a.id),
                  });
                },
              },
            ]),
          ]
        : []),
    ],
    [t, canEdit, confirm, del],
  );

  return (
    <div className="space-y-6">
      <Alert variant="info">
        {t("admin.mailRouting.accountsTab.fallbackInfo", {
          defaultFrom: state.defaultFrom,
        })}
      </Alert>

      <SectionCard
        title={t("admin.mailRouting.accountsTab.title")}
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setModal({ kind: "form" })}>
              {t("admin.mailRouting.accountsTab.add")}
            </Button>
          )
        }
      >
        <DataTable
          dense
          columns={columns}
          data={state.accounts}
          getRowId={(a) => a.id}
          emptyText={t("admin.mailRouting.accountsTab.empty")}
        />
      </SectionCard>

      {modal?.kind === "form" && (
        <AccountFormModal
          key={modal.account?.id ?? "new"}
          open
          onClose={close}
          account={modal.account}
        />
      )}
      {modal?.kind === "test" && (
        <AccountTestModal
          key={modal.account.id}
          open
          onClose={close}
          account={modal.account}
        />
      )}
    </div>
  );
}
