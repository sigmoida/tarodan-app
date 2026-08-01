"use client";

import React from "react";
import {
  LockClosedIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Checkbox, DisclosureButton, IconButton } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { ROLES, getRoleMeta, getPermissionGroups } from "../_lib/constants";
import type { PermissionMatrix } from "../_lib/usePermissionMatrix";

/**
 * Presentational role × permission pivot: grouped permission rows down, roles
 * across, with a sticky first column, collapsible groups and per-row
 * description disclosure. This is a matrix (not a flat list), so it stays a raw
 * `<table>` rather than the `DataTable`/`col.*` factory — the factory models
 * one row per record, not a group-header + tri-state-group + dynamic-role-column
 * grid. All state and toggles come from `usePermissionMatrix`.
 *
 * Every cell — editable, read-only and the always-on super-admin column — is the
 * SAME shared `Checkbox`; read-only cells are simply disabled. One control, one
 * visual language, so the legend can render the exact same thing.
 */
export function PermissionMatrixGrid({ matrix }: { matrix: PermissionMatrix }) {
  const t = useTranslations();
  const roleMeta = getRoleMeta(t);
  const permissionGroups = getPermissionGroups(t);
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
    <SectionCard bodyClassName="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 w-[40%] min-w-[15rem] bg-surface-alt px-4 py-3 text-left font-medium text-muted">
              {t("admin.roles.matrix.columnHeader")}
            </th>
            {ROLES.map((role) => (
              <th
                key={role}
                className="min-w-[8rem] bg-surface-alt px-4 py-3 text-center font-medium"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-heading">
                  {role === "super_admin" && (
                    <LockClosedIcon className="h-3.5 w-3.5 text-subtle" />
                  )}
                  {roleMeta[role].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {permissionGroups.map((g) => {
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
                        (
                        {t("admin.roles.permissionCountLabel", {
                          count: g.permissions.length,
                        })}
                        )
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
                          <span className="text-xs text-muted">
                            {t("admin.roles.allLabel")}
                          </span>
                        ) : editMode && isSuperAdmin ? (
                          <Checkbox
                            checked={state === "all"}
                            indeterminate={state === "partial"}
                            onChange={() =>
                              toggleGroup(g, role, state !== "all")
                            }
                            title={
                              state === "all"
                                ? t("admin.roles.matrix.removeGroup")
                                : t("admin.roles.matrix.selectGroup")
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
                              aria-label={t(
                                "admin.roles.matrix.descriptionLabel",
                              )}
                              title={t("admin.roles.matrix.descriptionLabel")}
                              onClick={() => toggleExpandedPerm(perm.key)}
                              className="mt-0.5 h-auto w-auto shrink-0 p-0 text-muted hover:bg-transparent hover:text-primary-600"
                            >
                              <InformationCircleIcon className="h-4 w-4" />
                            </IconButton>
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-heading">
                                {perm.label}
                              </span>
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
                          const locked = role === "super_admin";
                          const checked =
                            locked || hasPermission(role, perm.key);
                          const interactive =
                            editMode && !locked && isSuperAdmin;
                          return (
                            <td key={role} className="px-4 py-2.5 text-center">
                              <Checkbox
                                checked={checked}
                                disabled={!interactive}
                                onChange={
                                  interactive
                                    ? () => togglePermission(role, perm.key)
                                    : undefined
                                }
                                title={
                                  locked
                                    ? t(
                                        "admin.roles.matrix.superAdminAlwaysHasPermission",
                                      )
                                    : interactive
                                      ? checked
                                        ? t("common.remove")
                                        : t("common.add")
                                      : undefined
                                }
                                className="mx-auto"
                              />
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
    </SectionCard>
  );
}
