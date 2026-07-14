/** @format */

'use client';

import { ShoppingCartIcon } from '@heroicons/react/24/outline';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageShell } from '@/components/layout/PageShell';
import { useLocale, useTranslations } from "next-intl";

export default function EmptyCart() {
	const t = useTranslations();
	return (
		<PageShell className='flex items-center justify-center'>
			<div className='text-center'>
				<ShoppingCartIcon className='w-24 h-24 text-border-strong mx-auto mb-4' />
				<h2 className='text-2xl font-bold text-heading mb-2'>{t('cart.empty')}</h2>
				<p className='text-muted mb-6'>{t('cart.emptyDesc')}</p>
				<ButtonLink href='/listings'>{t('cart.browseListings')}</ButtonLink>
			</div>
		</PageShell>
	);
}
