/** @format */

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Alert, Button, Checkbox, Chip, Spinner } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useClientTableSort } from "@/hooks/useClientTableSort";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/provider/ConfirmProvider";
import { ROLES, getRoleMeta } from "../_lib/constants";
import { staffColumns } from "../_lib/columns";
import { staffRowMenu } from "../_lib/rowActions";
import { usePermissionsQuery } from "../_lib/usePermissions";
import type { StaffItem } from "../_lib/types";
import { StaffFormModal } from "../_modals/StaffFormModal";

/** "Kullanıcı Atamaları" tab: role filters + staff table + assignment modal. */
export function StaffAssignmentsTab({
  onShowMatrix,
}: {
  onShowMatrix: () => void;
}) {
  const t = useTranslations();
  const roleMeta = getRoleMeta(t);
  const confirm = useConfirm();
  const { user } = useSession();
  const isSuperAdmin = user?.role === "super_admin";

  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [modal, setModal] = useState<{ editing: StaffItem | null } | null>(
    null,
  );
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [allowAdminAssign, setAllowAdminAssign] = useState(false);

  const permissionsQuery = usePermissionsQuery();
  const permissions = permissionsQuery.data ?? {};

  const staffQuery = useQuery({
    queryKey: adminKeys.all("staff"),
    queryFn: async () => {
      const res = await adminApi.getStaff();
      return {
        items: (res.data?.items ?? []) as StaffItem[],
        roleCounts: (res.data?.roleCounts ?? {
          super_admin: 0,
          admin: 0,
          moderator: 0,
        }) as Record<string, number>,
      };
    },
  });
  const staff = staffQuery.data?.items ?? [];
  const roleCounts = staffQuery.data?.roleCounts ?? {
    super_admin: 0,
    admin: 0,
    moderator: 0,
  };

  // Role-assignment setting — optimistic toggle, persisted via mutation.
  useQuery({
    queryKey: adminKeys.all("staff-settings"),
    queryFn: async () => {
      const val = !!(await adminApi.getStaffSettings()).data?.allowAdminAssign;
      setAllowAdminAssign(val);
      return val;
    },
  });

  const settingsMut = useAdminMutation(
    (next: boolean) => adminApi.setStaffSettings(next),
    {
      invalidates: ["staff-settings"],
      errorMessage: t("admin.roles.settingsUpdateError"),
      onSuccess: (_d, next) =>
        toast.success(
          next
            ? t("admin.roles.allowAdminAssignOn")
            : t("admin.roles.allowAdminAssignOff"),
        ),
    },
  );
  const toggleAllowAdmin = () => {
    if (settingsMut.isPending) return;
    const next = !allowAdminAssign;
    setAllowAdminAssign(next); // optimistic
    settingsMut.mutate(next, { onError: () => setAllowAdminAssign(!next) });
  };

  const revoke = useAdminMutation((id: string) => adminApi.removeStaff(id), {
    invalidates: ["staff"],
    successMessage: t("admin.roles.revokeSuccess"),
    errorMessage: t("admin.roles.revokeError"),
  });
  const onRevoke = async (s: StaffItem) => {
    await confirm({
      description: t("admin.roles.revokeConfirm", { email: s.email }),
      destructive: true,
      onConfirm: () => revoke.mutateAsync(s.id),
    });
  };

  const columns = staffColumns(
    t,
    permissions,
    staffRowMenu(t, { onEdit: (s) => setModal({ editing: s }), onRevoke }),
  );
  const visibleStaff = roleFilter
    ? staff.filter((s) => s.role === roleFilter)
    : staff;
  const sortedStaff = useClientTableSort(visibleStaff);

  return (
    <div className="space-y-4">
      {/* Temporary password notice */}
      {createdInfo && (
        <Alert variant="warning" onClose={() => setCreatedInfo(null)}>
          <strong>{createdInfo.email}</strong>{" "}
          {t("admin.roles.staffCreatedNotice")}{" "}
          <code className="rounded bg-surface-elevated px-2 py-0.5 font-mono">
            {createdInfo.password}
          </code>{" "}
          {t("admin.roles.staffCreatedNoticeSuffix")}
        </Alert>
      )}

      <SectionCard bodyClassName="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-heading">
            {t("admin.roles.staffHeading")}
          </h3>
          <div className="flex items-center gap-1.5">
            {ROLES.map((r) => {
              const active = roleFilter === r;
              return (
                <Chip
                  key={r}
                  active={active}
                  onClick={() => setRoleFilter(active ? null : r)}
                >
                  {roleMeta[r].label} {roleCounts[r] ?? 0}
                </Chip>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {isSuperAdmin && (
            <Checkbox
              checked={allowAdminAssign}
              onChange={toggleAllowAdmin}
              disabled={settingsMut.isPending}
              label={
                <span className="inline-flex items-center gap-2">
                  {t("admin.roles.allowAdminAssignLabel")}
                  {settingsMut.isPending && <Spinner size="sm" />}
                </span>
              }
            />
          )}
          <Button
            onClick={() => setModal({ editing: null })}
            leftIcon={<PlusIcon className="h-5 w-5" />}
          >
            {t("admin.roles.assignStaffButton")}
          </Button>
        </div>
      </SectionCard>

      <DataTable
        columns={columns}
        data={sortedStaff.rows}
        loading={staffQuery.isLoading}
        emptyText={
          roleFilter ? t("admin.roles.emptyFiltered") : t("admin.roles.empty")
        }
        getRowId={(s) => s.id}
        sort={sortedStaff.sort}
        onSort={sortedStaff.setSort}
      />

      {modal && (
        <StaffFormModal
          key={modal.editing?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          editing={modal.editing}
          permissions={permissions}
          onCreated={setCreatedInfo}
          onShowMatrix={onShowMatrix}
        />
      )}
    </div>
  );
}
