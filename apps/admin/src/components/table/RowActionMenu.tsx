/** @format */

'use client';

import { Fragment, type ComponentType } from 'react';
import {
	IconButton,
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '@tarodan/ui';
import {
	EllipsisHorizontalIcon,
	CheckCircleIcon,
	XCircleIcon,
	PencilIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import { Empty } from './cells';

export interface RowAction {
	label: string;
	icon?: ComponentType<{ className?: string }>;
	onClick: () => void;
	/** Red style + automatic separator above the destructive group. */
	destructive?: boolean;
	disabled?: boolean;
}

/** Lets conditional actions be passed as falsy via `cond && {...}`. */
export type RowActionItem = RowAction | false | null | undefined;

/** Standard menu action that toggles active/inactive state in one click. */
export function activeToggleAction(
	active: boolean,
	onToggle: () => void,
): RowAction {
	return {
		label: active ? 'Pasifleştir' : 'Aktifleştir',
		icon: active ? XCircleIcon : CheckCircleIcon,
		onClick: onToggle,
	};
}

/** Standard "Edit + Delete" row action pair (common to most CRUD lists). */
export function editDeleteActions<T>(
	row: T,
	{
		onEdit,
		onDelete,
		deleteDisabled,
	}: { onEdit: (r: T) => void; onDelete: (r: T) => void; deleteDisabled?: boolean },
): RowAction[] {
	return [
		{ label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(row) },
		{
			label: 'Sil',
			icon: TrashIcon,
			onClick: () => onDelete(row),
			destructive: true,
			disabled: deleteDisabled,
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
	const actions = items.filter(Boolean) as RowAction[];
	if (actions.length === 0) return <Empty />;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					aria-label='İşlemler'
					className='text-muted hover:text-heading'>
					<EllipsisHorizontalIcon className='h-5 w-5' />
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align='end'
				className='w-44'>
				{actions.map((a, i) => {
					const needsSeparator =
						a.destructive && i > 0 && !actions[i - 1].destructive;
					return (
						<Fragment key={i}>
							{needsSeparator && <DropdownMenuSeparator />}
							<DropdownMenuItem
								danger={a.destructive}
								disabled={a.disabled}
								onSelect={a.onClick}>
								{a.icon && <a.icon className='h-4 w-4 shrink-0' />}
								{a.label}
							</DropdownMenuItem>
						</Fragment>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
