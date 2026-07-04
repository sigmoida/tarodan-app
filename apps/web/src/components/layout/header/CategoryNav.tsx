/** @format */

'use client';

import Link from 'next/link';
import {
	NavigationMenu,
	NavigationMenuList,
	NavigationMenuItem,
	NavigationMenuTrigger,
	NavigationMenuContent,
	NavigationMenuLink,
} from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { CATEGORY_BAR_ITEMS, SCALE_FALLBACK } from './nav/config';
import { useNavCatalog } from './nav/useNavCatalog';
import CategoriesPanel from './nav/CategoriesPanel';
import ScalesPanel from './nav/ScalesPanel';

const NAV_LINK_CLASS =
	'whitespace-nowrap px-3 py-2 text-sm font-medium text-inverted/90 hover:text-inverted hover:bg-surface-elevated/10 transition-colors rounded';
const NAV_TRIGGER_CLASS =
	'text-inverted/90 hover:text-inverted hover:bg-surface-elevated/10 data-[state=open]:bg-surface-elevated/10 data-[state=open]:text-inverted';

export default function CategoryNav() {
	const { locale } = useTranslation();
	const { categories, manufacturers, scales } = useNavCatalog();

	const items = CATEGORY_BAR_ITEMS[locale as 'tr' | 'en'];
	const vehicleTypes = categories.map((c) => ({ label: c.name, slug: c.slug }));
	const scaleItems = scales.length > 0 ? scales : SCALE_FALLBACK;

	return (
		<NavigationMenu viewport={false} className='w-full max-w-none'>
			<NavigationMenuList className='h-12 justify-start gap-2'>
				{items.map((item) => (
					<NavigationMenuItem key={item.label}>
						{item.href ? (
							<NavigationMenuLink asChild>
								<Link
									href={item.href}
									className={NAV_LINK_CLASS}>
									{item.label}
								</Link>
							</NavigationMenuLink>
						) : (
							<>
								<NavigationMenuTrigger className={NAV_TRIGGER_CLASS}>
									{item.label}
								</NavigationMenuTrigger>
								<NavigationMenuContent className='absolute left-0 top-full mt-1.5 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0'>
									{item.dropdown === 'categories' ? (
										<CategoriesPanel
											locale={locale}
											vehicleTypes={vehicleTypes}
											manufacturers={manufacturers}
										/>
									) : (
										<ScalesPanel
											title={locale === 'en' ? 'SCALE' : 'ÖLÇEK'}
											scales={scaleItems}
										/>
									)}
								</NavigationMenuContent>
							</>
						)}
					</NavigationMenuItem>
				))}
			</NavigationMenuList>
		</NavigationMenu>
	);
}
