/** @format */

"use client";

import { Fragment, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@tarodan/ui";
import {
  EllipsisHorizontalIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Empty } from "./cells";
import type { Translate } from "@/lib/statusLabels";

export interface RowAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Red style + automatic separator above the destructive group. */
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a spinner on this row's menu trigger and blocks repeat actions. */
  isLoading?: boolean;
}

/** Lets conditional actions be passed as falsy via `cond && {...}`. */
export type RowActionItem = RowAction | false | null | undefined;

// activeToggleAction/editDeleteActions below are plain functions (not
// components/hooks), so they take the translator as a parameter — every caller
// is a `_lib/rowActions.tsx` builder that already receives `t`.

/** Standard menu action that toggles active/inactive state in one click. */
export function activeToggleAction(
  active: boolean,
  onToggle: () => void,
  t: Translate,
  isLoading = false,
): RowAction {
  return {
    label: active
      ? t("admin.shared.rowActions.deactivate")
      : t("admin.shared.rowActions.activate"),
    icon: active ? XCircleIcon : CheckCircleIcon,
    onClick: onToggle,
    disabled: isLoading,
  };
}

/** Standard "Edit + Delete" row action pair (common to most CRUD lists). */
export function editDeleteActions<T>(
  row: T,
  {
    onEdit,
    onDelete,
    deleteDisabled,
    deleteLoading,
  }: {
    onEdit: (r: T) => void;
    onDelete: (r: T) => void;
    deleteDisabled?: boolean;
    deleteLoading?: boolean;
  },
  t: Translate,
): RowAction[] {
  return [
    { label: t("common.edit"), icon: PencilIcon, onClick: () => onEdit(row) },
    {
      label: t("common.delete"),
      icon: TrashIcon,
      onClick: () => onDelete(row),
      destructive: true,
      disabled: deleteDisabled,
      isLoading: deleteLoading,
    },
  ];
}

/**
 * The SINGLE mechanism for row actions — a ⋮ menu. The page only declares the
 * LIST of actions (conditionals can be passed via `cond && {...}`); the trigger,
 * alignment, icon and destructive separator are locked here. Renders an em-dash
 * placeholder when there's no visible action. Non-destructive actions are grouped
 * on top, destructive ones below the separator.
 */
export function RowActionMenu({ items }: { items: RowActionItem[] }) {
  const t = useTranslations();
  const actions = items.filter(Boolean) as RowAction[];
  if (actions.length === 0) return <Empty />;
  const isLoading = actions.some((action) => action.isLoading);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          aria-label={t("common.actions")}
          isLoading={isLoading}
          className="text-muted hover:text-heading"
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((a, i) => {
          const needsSeparator =
            a.destructive && i > 0 && !actions[i - 1].destructive;
          return (
            <Fragment key={i}>
              {needsSeparator && <DropdownMenuSeparator />}
              <DropdownMenuItem
                danger={a.destructive}
                disabled={a.disabled || a.isLoading || isLoading}
                onSelect={a.onClick}
              >
                {a.icon && <a.icon className="h-4 w-4 shrink-0" />}
                {a.label}
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
