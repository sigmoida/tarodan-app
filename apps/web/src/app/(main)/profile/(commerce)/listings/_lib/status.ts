/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	ClockIcon,
	CheckCircleIcon,
	XCircleIcon,
} from '@heroicons/react/24/outline';
import type { BadgeVariant } from '@tarodan/ui';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ListingStatusMeta {
	label: string;
	variant: BadgeVariant;
	icon: Icon;
}

/** Listing status → Badge variant + label + icon (single source of truth). */
export const LISTING_STATUS: Record<string, ListingStatusMeta> = {
	pending: { label: 'Onay Bekliyor', variant: 'warning', icon: ClockIcon },
	active: { label: 'Aktif', variant: 'success', icon: CheckCircleIcon },
	rejected: { label: 'Reddedildi', variant: 'danger', icon: XCircleIcon },
	sold: { label: 'Satıldı', variant: 'primary', icon: CheckCircleIcon },
	reserved: { label: 'Rezerve', variant: 'primary', icon: ClockIcon },
	inactive: { label: 'Pasif', variant: 'default', icon: XCircleIcon },
	deleted: { label: 'Kaldırıldı', variant: 'danger', icon: XCircleIcon },
};

export const getListingStatus = (status: string): ListingStatusMeta =>
	LISTING_STATUS[status] ?? LISTING_STATUS.pending;

export const FILTER_TABS = [
	{ value: 'all', label: 'Tümü' },
	{ value: 'pending', label: 'Onay Bekleyen' },
	{ value: 'active', label: 'Aktif' },
	{ value: 'reserved', label: 'Rezerve' },
	{ value: 'sold', label: 'Satılan' },
	{ value: 'inactive', label: 'Pasif' },
	{ value: 'deleted', label: 'Kaldırılan' },
];
