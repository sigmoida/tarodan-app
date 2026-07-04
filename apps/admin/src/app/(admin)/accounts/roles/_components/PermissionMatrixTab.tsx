'use client';

import React, { useEffect, useState } from 'react';
import {
  PencilIcon,
  LockClosedIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Button, CheckToggle, DisclosureButton, IconButton } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useSession } from '@/context/SessionContext';
import { useConfirm } from '@/provider/ConfirmProvider';
import {
  ROLES,
  ROLE_META,
  FALLBACK_DEFAULTS,
  PERMISSION_GROUPS,
} from '../_lib/constants';
import type { PermGroup } from '../_lib/types';
import { usePermissionsQuery } from '../_lib/usePermissions';

/**
 * "İzin Matrisi" tab: role × page permission grid. Super Admin enters edit mode
 * and toggles permissions individually or by group; saving goes through
 * `useAdminMutation`, and the page reloads to refresh the sidebar filter.
 */
export function PermissionMatrixTab() {
  const confirm = useConfirm();
  const { user } = useSession();
  const isSuperAdmin = user?.role === 'super_admin';

  const permissionsQuery = usePermissionsQuery();
  const matrixLoading = permissionsQuery.isLoading;

  // Editable copy — seeded from server data.
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedPerm, setExpandedPerm] = useState<string | null>(null);

  useEffect(() => {
    if (permissionsQuery.data) setPermissions(permissionsQuery.data);
  }, [permissionsQuery.data]);

  const hasPermission = (role: string, perm: string) =>
    (permissions[role] ?? []).includes(perm);

  const togglePermission = (role: string, perm: string) => {
    if (!editMode || !isSuperAdmin || role === 'super_admin') return;
    setPermissions((prev) => {
      const cur = prev[role] ?? [];
      const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
      return { ...prev, [role]: next };
    });
    setMatrixDirty(true);
  };

  const toggleGroup = (group: PermGroup, role: string, checked: boolean) => {
    if (!editMode || !isSuperAdmin || role === 'super_admin') return;
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

  const groupCheckedState = (group: PermGroup, role: string): 'all' | 'none' | 'partial' => {
    const perms = permissions[role] ?? [];
    const count = group.permissions.filter((p) => perms.includes(p.key)).length;
    if (count === 0) return 'none';
    if (count === group.permissions.length) return 'all';
    return 'partial';
  };

  const saveMatrixMut = useAdminMutation(
    (perms: Record<string, string[]>) => adminApi.setRolePermissions(perms),
    {
      invalidates: ['role-permissions'],
      successMessage: 'İzin matrisi kaydedildi',
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

  const cancelEdit = async () => {
    if (matrixDirty) {
      const ok = await confirm({
        description:
          'Kaydedilmemiş değişiklikler var. Değişikliklerden vazgeçmek istediğinizden emin misiniz?',
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
        'Tüm rol izinlerini varsayılan değerlere sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.',
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

  return (
    <div className="space-y-4">
      {/* Top control bar */}
      <div className="admin-card flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-heading">İzin Matrisi</h3>
          <p className="mt-0.5 text-sm text-muted">
            {isSuperAdmin
              ? 'Düzenle moduna geçerek her rolün izinlerini tıklayarak değiştirebilirsiniz.'
              : 'İzin matrisini yalnızca Süper Admin düzenleyebilir.'}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {editMode ? (
              <>
                <Button
                  variant="secondary"
                  onClick={resetToDefaults}
                  disabled={matrixSaving}
                  leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                >
                  Varsayılana Sıfırla
                </Button>
                <Button variant="secondary" onClick={cancelEdit} disabled={matrixSaving}>
                  İptal
                </Button>
                <Button onClick={saveMatrix} disabled={!matrixDirty || matrixSaving} isLoading={matrixSaving}>
                  Kaydet
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)} leftIcon={<PencilIcon className="h-4 w-4" />}>
                Düzenle
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unsaved changes warning */}
      {editMode && matrixDirty && (
        <div className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-2.5 text-sm text-warning-800">
          <InformationCircleIcon className="h-4 w-4 shrink-0" />
          Kaydedilmemiş değişiklikler var.
        </div>
      )}

      {/* Role description cards */}
      {!matrixLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ROLES.map((role) => {
            const meta = ROLE_META[role];
            const count = role === 'super_admin' ? 'Tümü' : `${(permissions[role] ?? []).length} izin`;
            return (
              <div key={role} className={`rounded-lg border px-4 py-3 ${meta.color}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="font-mono text-xs opacity-70">{count}</span>
                </div>
                <p className="text-xs leading-relaxed opacity-80">{meta.description}</p>
                {role === 'super_admin' && (
                  <div className="mt-2 flex items-center gap-1 text-xs opacity-60">
                    <LockClosedIcon className="h-3 w-3" />
                    Kilitli — değiştirilemez
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Matrix table */}
      {matrixLoading ? (
        <div className="admin-card flex h-40 items-center justify-center text-sm text-muted">
          Yükleniyor…
        </div>
      ) : (
        <div className="admin-card overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 w-[40%] min-w-[15rem] bg-surface-alt px-4 py-3 text-left font-medium text-muted">
                  İzin / Açıklama
                </th>
                {ROLES.map((role) => (
                  <th key={role} className="min-w-[8rem] bg-surface-alt px-4 py-3 text-center font-medium">
                    <div
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_META[role].color}`}
                    >
                      {role === 'super_admin' && <LockClosedIcon className="h-3 w-3" />}
                      {ROLE_META[role].label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {PERMISSION_GROUPS.map((g) => {
                const isCollapsed = collapsedGroups.has(g.id);
                return (
                  <React.Fragment key={g.id}>
                    {/* Group header row */}
                    <tr className="border-b border-border-subtle bg-surface-alt/60">
                      <td className="sticky left-0 z-10 bg-surface-alt/60 px-3 py-2">
                        <DisclosureButton
                          open={!isCollapsed}
                          onClick={() => toggleGroupCollapse(g.id)}
                          className="text-xs font-semibold uppercase tracking-wide text-heading transition-colors hover:text-primary-600"
                        >
                          {g.group}
                          <span className="font-normal normal-case tracking-normal text-muted">
                            ({g.permissions.length} izin)
                          </span>
                        </DisclosureButton>
                      </td>

                      {ROLES.map((role) => {
                        const state = groupCheckedState(g, role);
                        const locked = role === 'super_admin';
                        return (
                          <td key={role} className="bg-surface-alt/60 px-4 py-2 text-center">
                            {locked ? (
                              <span className="text-xs font-medium text-success-600">Tümü</span>
                            ) : editMode && isSuperAdmin ? (
                              <CheckToggle
                                size="sm"
                                checked={state === 'all'}
                                indeterminate={state === 'partial'}
                                onClick={() => toggleGroup(g, role, state !== 'all')}
                                title={state === 'all' ? 'Grubu kaldır' : 'Grubu seç'}
                                className="mx-auto"
                              />
                            ) : (
                              <span className="text-xs text-muted">
                                {g.permissions.filter((p) => hasPermission(role, p.key)).length}/
                                {g.permissions.length}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Permission rows */}
                    {!isCollapsed &&
                      g.permissions.map((perm) => {
                        const isExpanded = expandedPerm === perm.key;
                        return (
                          <tr
                            key={perm.key}
                            className={`border-b border-border-subtle transition-colors ${
                              isExpanded ? 'bg-surface-alt/40' : 'hover:bg-surface-alt/20'
                            }`}
                          >
                            <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5">
                              <div className="flex items-start gap-2">
                                <IconButton
                                  aria-label="Açıklama"
                                  title="Açıklama"
                                  onClick={() => setExpandedPerm(isExpanded ? null : perm.key)}
                                  className="mt-0.5 h-auto w-auto shrink-0 p-0 text-muted hover:bg-transparent hover:text-primary-600"
                                >
                                  <InformationCircleIcon className="h-4 w-4" />
                                </IconButton>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-heading">{perm.label}</span>
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-1.5 space-y-1">
                                      <p className="text-xs leading-relaxed text-muted">
                                        {perm.description}
                                      </p>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {perm.pages.map((page) => (
                                          <code
                                            key={page}
                                            className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-muted"
                                          >
                                            {page}
                                          </code>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {ROLES.map((role) => {
                              const checked = hasPermission(role, perm.key);
                              const locked = role === 'super_admin';
                              const interactive = editMode && !locked && isSuperAdmin;
                              return (
                                <td key={role} className="px-4 py-2.5 text-center">
                                  {interactive ? (
                                    <CheckToggle
                                      checked={checked}
                                      onClick={() => togglePermission(role, perm.key)}
                                      title={checked ? 'Kaldır' : 'Ekle'}
                                      className="mx-auto"
                                    />
                                  ) : locked ? (
                                    <span
                                      className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-500/15"
                                      title="Süper Admin her zaman bu izne sahiptir"
                                    >
                                      <LockClosedIcon className="h-3.5 w-3.5 text-success-600" />
                                    </span>
                                  ) : checked ? (
                                    <span className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/10">
                                      <CheckIcon className="h-3.5 w-3.5 text-primary-600" />
                                    </span>
                                  ) : (
                                    <span className="mx-auto inline-flex h-6 w-6 items-center justify-center">
                                      <span className="block h-2 w-2 rounded-full bg-border" />
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!matrixLoading && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-500/15">
              <LockClosedIcon className="h-3 w-3 text-success-600" />
            </span>
            Süper Admin — her zaman tam yetkili
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/10">
              <CheckIcon className="h-3 w-3 text-primary-600" />
            </span>
            İzin mevcut
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <span className="block h-2 w-2 rounded-full bg-border" />
            </span>
            İzin yok
          </span>
          <span className="flex items-center gap-1.5">
            <InformationCircleIcon className="h-4 w-4 text-muted" />
            İzin adının solundaki ikona tıklayarak açıklama görebilirsiniz
          </span>
        </div>
      )}
    </div>
  );
}
