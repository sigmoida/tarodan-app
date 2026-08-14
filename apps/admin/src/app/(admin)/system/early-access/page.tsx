"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { type RowActionItem } from "@/components/table";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { pinColumns } from "./_lib/columns";
import { type SiteAccessPin } from "./_lib/types";
import { earlyAccessFilterFields } from "./_lib/filters";
import { PinFormModal } from "./_modals/PinFormModal";

export default function EarlyAccessPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ pin?: SiteAccessPin } | null>(null);

  const del = useAdminMutation(
    (id: string) => adminApi.deleteSiteAccessPin(id),
    {
      invalidates: ["site-access-pins"],
      successMessage: t("admin.earlyAccess.toasts.deleted"),
    },
  );

  const toggle = useAdminMutation(
    (pin: SiteAccessPin) =>
      adminApi.updateSiteAccessPin(pin.id, { isActive: !pin.isActive }),
    {
      invalidates: ["site-access-pins"],
      successMessage: t("admin.earlyAccess.toasts.updated"),
    },
  );

  const sendInvite = useAdminMutation(
    (id: string) => adminApi.sendSiteAccessPinInvite(id),
    {
      invalidates: ["site-access-pins"],
      successMessage: t("admin.earlyAccess.toasts.inviteSent"),
    },
  );

  const onDelete = useCallback(
    async (pin: SiteAccessPin) => {
      await confirm({
        title: t("admin.earlyAccess.confirm.deleteTitle"),
        description: t("admin.earlyAccess.confirm.deleteMessage"),
        destructive: true,
        onConfirm: () => del.mutateAsync(pin.id),
      });
    },
    [confirm, del, t],
  );

  const rowActions = useCallback(
    (pin: SiteAccessPin): RowActionItem[] => [
      {
        label: pin.lastSentAt
          ? t("admin.earlyAccess.actions.resendInvite")
          : t("admin.earlyAccess.actions.sendInvite"),
        icon: EnvelopeIcon,
        onClick: () => sendInvite.mutate(pin.id),
        disabled: !pin.email || sendInvite.isPending,
      },
      {
        label: t("admin.earlyAccess.actions.copyCode"),
        icon: ClipboardDocumentIcon,
        onClick: () => {
          void navigator.clipboard.writeText(pin.code);
          toast.success(t("admin.earlyAccess.toasts.codeCopied"));
        },
      },
      {
        label: t("common.edit"),
        icon: PencilIcon,
        onClick: () => setModal({ pin }),
      },
      {
        label: pin.isActive
          ? t("admin.earlyAccess.actions.revoke")
          : t("admin.earlyAccess.actions.activate"),
        icon: pin.isActive ? XCircleIcon : CheckCircleIcon,
        onClick: () => toggle.mutate(pin),
        disabled: toggle.isPending,
      },
      {
        label: t("common.delete"),
        icon: TrashIcon,
        onClick: () => void onDelete(pin),
        destructive: true,
      },
    ],
    [t, sendInvite, toggle, onDelete],
  );

  const columns = useMemo(() => pinColumns(t, rowActions), [t, rowActions]);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.earlyAccess.title")}
        description={t("admin.earlyAccess.description")}
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.earlyAccess.createButton")}
        </Button>
      </PageHeader>

      <ResourceList<SiteAccessPin>
        resource="site-access-pins"
        fetcher={(params) => adminApi.getSiteAccessPins(params)}
        getRowId={(p) => p.id}
        syncUrl
        filters={earlyAccessFilterFields(t)}
      >
        <ResourceList.Toolbar
          searchPlaceholder={t("admin.earlyAccess.searchPlaceholder")}
        />
        <ResourceList.Table
          columns={columns}
          emptyText={t("admin.earlyAccess.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <PinFormModal
          key={modal.pin?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          pin={modal.pin}
        />
      )}
    </AdminPage>
  );
}
