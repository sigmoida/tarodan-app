"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/provider/ConfirmProvider";
import { FALLBACK_DEFAULTS } from "./constants";
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
  const confirm = useConfirm();
  const { user } = useSession();
  const isSuperAdmin = user?.role === "super_admin";

  const permissionsQuery = usePermissionsQuery();
  const matrixLoading = permissionsQuery.isLoading;

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
      successMessage: "İzin matrisi kaydedildi",
      onSuccess: () => {
        setMatrixDirty(false);
        setEditMode(false);
        // Reload the page to update the sidebar filtering.
        setTimeout(() => window.location.reload(), 800);
      },
    },
  );
  const matrixSaving = saveMatrixMut.isPending;
  const saveMatrix = () => saveMatrixMut.mutate(permissions);

  const enterEdit = () => setEditMode(true);

  const cancelEdit = async () => {
    if (matrixDirty) {
      const ok = await confirm({
        description:
          "Kaydedilmemiş değişiklikler var. Değişikliklerden vazgeçmek istediğinizden emin misiniz?",
        destructive: false,
      });
      if (!ok) return;
    }
    setEditMode(false);
    setMatrixDirty(false);
    permissionsQuery.refetch();
  };

  const resetToDefaults = async () => {
    const ok = await confirm({
      description:
        "Tüm rol izinlerini varsayılan değerlere sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.",
      destructive: true,
    });
    if (!ok) return;
    setPermissions(FALLBACK_DEFAULTS);
    setMatrixDirty(true);
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
