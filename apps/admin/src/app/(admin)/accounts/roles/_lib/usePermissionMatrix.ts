"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/provider/ConfirmProvider";
import type { PermGroup } from "./types";
import { usePermissionsQuery } from "./usePermissions";

export type GroupCheckedState = "all" | "none" | "partial";

/**
 * All state + behaviour for the "İzin Matrisi" tab: an editable copy of the
 * role → permission map seeded from the server, edit-mode/dirty tracking, the
 * per-cell and per-group toggles, and save/cancel/reset (each guarded by
 * `useConfirm`). Keeping this out of the view lets `PermissionMatrixTab` stay a
 * thin composition of presentational parts. Only Super Admin can mutate; the
 * `super_admin` role itself is always locked (full access).
 */
export function usePermissionMatrix() {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { user } = useSession();
  const isSuperAdmin = user?.role === "super_admin";

  const permissionsQuery = usePermissionsQuery();
  const matrixLoading = permissionsQuery.isLoading;
  // Matris okunamadıysa DÜZENLEME AÇILMAZ: boş/eksik bir kopyayı kaydetmek
  // tüm rollerin izinlerini silerdi.
  const matrixError = permissionsQuery.isError;

  // Editable copy — seeded from server data.
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [expandedPerm, setExpandedPerm] = useState<string | null>(null);

  useEffect(() => {
    if (permissionsQuery.data) setPermissions(permissionsQuery.data);
  }, [permissionsQuery.data]);

  const canEdit = (role: string) =>
    editMode && isSuperAdmin && role !== "super_admin";

  const hasPermission = (role: string, perm: string) =>
    (permissions[role] ?? []).includes(perm);

  const togglePermission = (role: string, perm: string) => {
    if (!canEdit(role)) return;
    setPermissions((prev) => {
      const cur = prev[role] ?? [];
      const next = cur.includes(perm)
        ? cur.filter((p) => p !== perm)
        : [...cur, perm];
      return { ...prev, [role]: next };
    });
    setMatrixDirty(true);
  };

  const toggleGroup = (group: PermGroup, role: string, checked: boolean) => {
    if (!canEdit(role)) return;
    const groupKeys = group.permissions.map((p) => p.key);
    setPermissions((prev) => {
      const cur = prev[role] ?? [];
      const next = checked
        ? Array.from(new Set([...cur, ...groupKeys]))
        : cur.filter((k) => !groupKeys.includes(k));
      return { ...prev, [role]: next };
    });
    setMatrixDirty(true);
  };

  const groupCheckedState = (
    group: PermGroup,
    role: string,
  ): GroupCheckedState => {
    const perms = permissions[role] ?? [];
    const count = group.permissions.filter((p) => perms.includes(p.key)).length;
    if (count === 0) return "none";
    if (count === group.permissions.length) return "all";
    return "partial";
  };

  const saveMatrixMut = useAdminMutation(
    (perms: Record<string, string[]>) => adminApi.setRolePermissions(perms),
    {
      invalidates: ["role-permissions"],
      successMessage: t("admin.roles.matrixSaved"),
      onSuccess: () => {
        setMatrixDirty(false);
        setEditMode(false);
        // Re-render the server layout so its request-scoped permission set and
        // the client navigation context update without a full-page reload.
        router.refresh();
      },
    },
  );
  const matrixSaving = saveMatrixMut.isPending;
  const saveMatrix = () => saveMatrixMut.mutate(permissions);

  const enterEdit = () => {
    if (matrixError) return;
    setEditMode(true);
  };

  const cancelEdit = async () => {
    if (matrixDirty) {
      const ok = await confirm({
        description: t("admin.roles.discardChangesConfirm"),
        destructive: false,
      });
      if (!ok) return;
    }
    setEditMode(false);
    setMatrixDirty(false);
    permissionsQuery.refetch();
  };

  /**
   * Varsayılanlar SUNUCUDAN okunur. Önyüzde ikinci bir kopya tutulduğunda
   * kaçınılmaz olarak kayıyordu: kopya `reports`/`invoices` izinlerini
   * içermediği için "sıfırla" bu izinleri sessizce siliyor, kaydedince
   * admin/moderator rolleri o sayfaları kaybediyordu.
   */
  const resetToDefaults = async () => {
    const ok = await confirm({
      description: t("admin.roles.resetConfirm"),
      destructive: true,
    });
    if (!ok) return;
    try {
      const defaults = (await adminApi.getDefaultRolePermissions()).data ?? {};
      setPermissions(defaults);
      setMatrixDirty(true);
    } catch {
      toast.error(t("admin.roles.matrixLoadError"));
    }
  };

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpandedPerm = (key: string) =>
    setExpandedPerm((cur) => (cur === key ? null : key));

  return {
    // access
    isSuperAdmin,
    // data
    matrixLoading,
    matrixError,
    permissions,
    // edit state
    editMode,
    matrixDirty,
    matrixSaving,
    collapsedGroups,
    expandedPerm,
    // derived
    hasPermission,
    groupCheckedState,
    // actions
    togglePermission,
    toggleGroup,
    toggleGroupCollapse,
    toggleExpandedPerm,
    enterEdit,
    saveMatrix,
    cancelEdit,
    resetToDefaults,
  };
}

export type PermissionMatrix = ReturnType<typeof usePermissionMatrix>;
