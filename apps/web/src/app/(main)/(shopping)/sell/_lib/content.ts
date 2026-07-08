/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	ShieldCheckIcon,
	UserGroupIcon,
	Cog6ToothIcon,
	ArrowsRightLeftIcon,
	ClipboardDocumentListIcon,
	PhotoIcon,
	TruckIcon,
} from '@heroicons/react/24/outline';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface SellBenefit {
	icon: IconType;
	titleKey: string;
	descKey: string;
}

export interface SellStep {
	icon: IconType;
	textKey: string;
}

export const SELL_BENEFITS: SellBenefit[] = [
	{ icon: ShieldCheckIcon, titleKey: 'benefit1Title', descKey: 'benefit1Desc' },
	{ icon: UserGroupIcon, titleKey: 'benefit2Title', descKey: 'benefit2Desc' },
	{ icon: Cog6ToothIcon, titleKey: 'benefit3Title', descKey: 'benefit3Desc' },
	{ icon: ArrowsRightLeftIcon, titleKey: 'benefit4Title', descKey: 'benefit4Desc' },
];

export const SELL_STEPS: SellStep[] = [
	{ icon: ClipboardDocumentListIcon, textKey: 'step1' },
	{ icon: PhotoIcon, textKey: 'step2' },
	{ icon: TruckIcon, textKey: 'step3' },
];
