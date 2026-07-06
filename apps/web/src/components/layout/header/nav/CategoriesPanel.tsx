/** @format */

'use client';

import Link from 'next/link';
import { NavigationMenuLink } from '@tarodan/ui';
import { groupManufacturers, type ManufacturerRef } from './config';
import NavPanel from './NavPanel';

interface VehicleType {
	label: string;
	slug: string;
}

export default function CategoriesPanel({
	locale,
	vehicleTypes,
	manufacturers,
}: {
	locale: string;
	vehicleTypes: VehicleType[];
	manufacturers: ManufacturerRef[];
}) {
	const groups = groupManufacturers(manufacturers);

	return (
		<NavPanel>
			<div className='grid grid-cols-2 gap-8'>
				{/* Vehicle types */}
				<div>
					<h3 className='text-primary-500 font-bold text-base mb-4 tracking-wide'>
						{locale === 'en' ? 'VEHICLE TYPES' : 'ARAÇ TÜRLERİ'}
					</h3>
					<div className='grid grid-cols-2 gap-x-8 gap-y-2'>
						{vehicleTypes.map((type) => (
							<NavigationMenuLink
								asChild
								key={type.slug}>
								<Link
									href={`/listings?category=${encodeURIComponent(type.slug)}`}
									className='text-sm text-muted hover:text-primary-600 transition-colors py-1'>
									{type.label}
								</Link>
							</NavigationMenuLink>
						))}
					</div>
				</div>

				{/* Manufacturers */}
				<div>
					<h3 className='text-primary-500 font-bold text-base mb-4 tracking-wide'>
						{locale === 'en' ? 'MANUFACTURERS' : 'ÜRETİCİLER'}
					</h3>
					<div className='space-y-2.5'>
						{groups.map((group) => (
							<div key={group.range}>
								<p className='text-base font-bold text-subtle uppercase tracking-wider mb-1'>
									{group.range}
								</p>
								<div className='flex flex-wrap gap-x-1 gap-y-0.5'>
									{group.items.map((item, idx) => (
										<span
											key={item.id}
											className='inline-flex'>
											<NavigationMenuLink asChild>
												<Link
													href={`/listings?manufacturer=${encodeURIComponent(item.name)}&manufacturerId=${encodeURIComponent(item.id)}`}
													className='text-sm text-muted hover:text-primary-600 transition-colors'>
													{item.name}
												</Link>
											</NavigationMenuLink>
											{idx < group.items.length - 1 && (
												<span className='text-border-strong mx-1'>·</span>
											)}
										</span>
									))}
								</div>
							</div>
						))}
						<NavigationMenuLink asChild>
							<Link
								href='/manufacturers'
								className='text-xs text-primary-500 font-semibold hover:text-primary-600 transition-colors inline-block mt-1'>
								{locale === 'en' ? 'All Manufacturers' : 'Tüm Üreticiler'}
							</Link>
						</NavigationMenuLink>
					</div>
				</div>
			</div>
		</NavPanel>
	);
}
