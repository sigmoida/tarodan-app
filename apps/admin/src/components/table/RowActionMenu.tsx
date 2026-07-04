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
} from '@heroicons/react/24/outline';
import { Empty } from './cells';

export interface RowAction {
	label: string;
	icon?: ComponentType<{ className?: string }>;
	onClick: () => void;
	/** Kırmızı stil + yıkıcı grubun üstüne otomatik ayraç. */
	destructive?: boolean;
	disabled?: boolean;
}

/** Koşullu aksiyonların `cond && {...}` ile falsy geçilebilmesi için. */
export type RowActionItem = RowAction | false | null | undefined;

/** Aktif/pasif durumunu tek tıkla çeviren standart menü aksiyonu. */
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

/**
 * Satır aksiyonları için TEK mekanizma — bir ⋮ menüsü. Sayfa yalnızca aksiyon
 * LİSTESİNİ bildirir (koşulluları `cond && {...}` ile geçebilir); tetikleyici,
 * hizalama, ikon ve yıkıcı ayracı burada kilitli. Görünür aksiyon yoksa em-dash
 * placeholder basar. Yıkıcı olmayanlar üstte, yıkıcılar ayracın altında gruplanır.
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
