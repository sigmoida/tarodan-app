/** @format */

'use client';

import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";

export default function HelpCard({ orderId }: { orderId: string }) {
	const locale = useLocale();

	return (
		<SectionCard title={locale === 'en' ? 'Help' : 'Yardım'}>
			<div className='space-y-2'>
				<Link
					href={`/support?orderId=${orderId}`}
					className='block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors'>
					{locale === 'en' ? 'Report Order Issue' : 'Sipariş Sorunu Bildir'}
				</Link>
				<Link
					href='/profile/refund-requests'
					className='block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors'>
					{locale === 'en' ? 'My Refund Requests' : 'İade Taleplerim'}
				</Link>
				<Link
					href='/support'
					className='block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors'>
					{locale === 'en' ? 'Contact Support' : 'Destek ile İletişime Geç'}
				</Link>
			</div>
		</SectionCard>
	);
}
