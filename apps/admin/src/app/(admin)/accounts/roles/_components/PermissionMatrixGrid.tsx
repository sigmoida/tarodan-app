"use client";

import React from "react";
import {
  LockClosedIcon,
  CheckIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckToggle, DisclosureButton, IconButton } from "@tarodan/ui";
import { ROLES, ROLE_META, PERMISSION_GROUPS } from "../_lib/constants";
import type { PermissionMatrix } from "../_lib/usePermissionMatrix";

/**
 * Presentational role × permission pivot: grouped permission rows down, roles
 * across, with a sticky first column, collapsible groups and per-row
 * description disclosure. This is a matrix (not a flat list), so it stays a raw
 * `<table>` rather than the `DataTable`/`col.*` factory — the factory models
 * one row per record, not a group-header + tri-state-group + dynamic-role-column
 * grid. All state and toggles come from `usePermissionMatrix`.
 */
export function PermissionMatrixGrid({ matrix }: { matrix: PermissionMatrix }) {
  const {
    editMode,
    isSuperAdmin,
    collapsedGroups,
    expandedPerm,
    hasPermission,
    groupCheckedState,
    togglePermission,
    toggleGroup,
    toggleGroupCollapse,
    toggleExpandedPerm,
  } = matrix;

  return (
    <div className="bg-surface-elevated rounded-lg border border-border p-6 shadow-sm overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 w-[40%] min-w-[15rem] bg-surface-alt px-4 py-3 text-left font-medium text-muted">
              İzin / Açıklama
            </th>
            {ROLES.map((role) => (
              <th
                key={role}
                className="min-w-[8rem] bg-surface-alt px-4 py-3 text-center font-medium"
              >
                <div
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_META[role].color}`}
                >
                  {role === "super_admin" && (
                    <LockClosedIcon className="h-3 w-3" />
                  )}
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
                    const locked = role === "super_admin";
                    return (
                      <td
                        key={role}
                        className="bg-surface-alt/60 px-4 py-2 text-center"
                      >
                        {locked ? (
                          <span className="text-xs font-medium text-success-600">
                            Tümü
                          </span>
                        ) : editMode && isSuperAdmin ? (
                          <CheckToggle
                            size="sm"
                            checked={state === "all"}
                            indeterminate={state === "partial"}
                            onClick={() =>
                              toggleGroup(g, role, state !== "all")
                            }
                            title={
                              state === "all" ? "Grubu kaldır" : "Grubu seç"
                            }
                            className="mx-auto"
                          />
                        ) : (
                          <span className="text-xs text-muted">
                            {
                              g.permissions.filter((p) =>
                                hasPermission(role, p.key),
                              ).length
                            }
                            /{g.permissions.length}
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
                          isExpanded
                            ? "bg-surface-alt/40"
                            : "hover:bg-surface-alt/20"
                        }`}
                      >
                        <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5">
                          <div className="flex items-start gap-2">
                            <IconButton
                              aria-label="Açıklama"
                              title="Açıklama"
                              onClick={() => toggleExpandedPerm(perm.key)}
                              className="mt-0.5 h-auto w-auto shrink-0 p-0 text-muted hover:bg-transparent hover:text-primary-600"
                            >
                              <InformationCircleIcon className="h-4 w-4" />
                            </IconButton>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-heading">
                                  {perm.label}
                                </span>
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
                          const locked = role === "super_admin";
                          const interactive =
                            editMode && !locked && isSuperAdmin;
                          return (
                            <td key={role} className="px-4 py-2.5 text-center">
                              {interactive ? (
                                <CheckToggle
                                  checked={checked}
                                  onClick={() =>
                                    togglePermission(role, perm.key)
                                  }
                                  title={checked ? "Kaldır" : "Ekle"}
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
  );
}
