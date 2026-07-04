/** @format */

'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { Badge, SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { useProfile } from '../_context/ProfileContext';
import { buildMenuSections } from '../_lib/menu';

export default function ProfileMenu() {
	const { t } = useTranslation();
	const { pendingCounts } = useProfile();
	const sections = buildMenuSections(t, pendingCounts);

	return (
		<>
			{sections.map((section) => (
				<SectionCard key={section.title} title={section.title}>
					<div className='-mx-3 -mb-3 md:-mx-5 md:-mb-5 border-t border-border-subtle divide-y divide-border-subtle'>
						{section.items.map((item) => (
							<Link
								key={item.label}
								href={item.href}
								className='flex items-center gap-4 px-6 py-4 hover:bg-surface transition-colors group'>
								<div className='relative p-2 rounded bg-surface-alt group-hover:bg-primary-100 transition-colors'>
									<item.icon className='w-5 h-5 text-muted group-hover:text-primary-600 transition-colors' />
									{item.badge != null && item.badge > 0 && (
										<span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger-500 text-inverted text-xs font-bold rounded-sm flex items-center justify-center'>
											{item.badge > 99 ? '99+' : item.badge}
										</span>
									)}
								</div>
								<div className='flex-1'>
									<div className='flex items-center gap-2'>
										<p className='font-medium text-heading'>{item.label}</p>
										{item.badge != null && item.badge > 0 && (
											<Badge variant='danger' size='sm'>
												{item.badge} bekliyor
											</Badge>
										)}
									</div>
									<p className='text-sm text-muted'>{item.desc}</p>
								</div>
								<ChevronRightIcon className='w-5 h-5 text-border-strong group-hover:text-primary-400 transition-colors' />
							</Link>
						))}
					</div>
				</SectionCard>
			))}
		</>
	);
}
