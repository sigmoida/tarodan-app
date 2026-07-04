/** @format */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/i18n/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Button } from '@tarodan/ui';
import { Container } from './Container';

export default function Footer() {
	const { t, locale } = useTranslation();

	const FOOTER_LINKS = {
		marketplace: [
			{ href: '/listings', label: t('nav.listings') },
			{ href: '/trades', label: t('nav.trades') },
			{ href: '/collections', label: t('nav.collections') },
			{ href: '/pricing', label: t('membership.title') },
		],
		support: [
			{ href: '/about', label: t('footer.about') },
			{ href: '/help', label: t('footer.help') },
			{ href: '/contact', label: t('footer.contact') },
			{ href: '/faq', label: t('footer.faq') },
		],
		legal: [
			{ href: '/terms', label: t('footer.terms') },
			{ href: '/privacy', label: t('footer.privacy') },
			{ href: '/cookies', label: t('footer.cookies') },
		],
	};

	return (
		<footer className='bg-surface-elevated border-t border-border'>
			<Container className='px-4'>
				<div className='grid grid-cols-2 md:grid-cols-5 gap-8'>
					{/* Brand */}
					<div className='col-span-2 md:col-span-1'>
						<Link
							href='/'
							className='inline-block mb-3'>
							<Image
								src='/tarodan-logo.jpg'
								alt='Tarodan Logo'
								width={110}
								height={36}
								className='object-contain'
								style={{ width: 'auto', height: 'auto', borderRadius: '2px' }}
							/>
						</Link>
						<p className='text-xs text-muted max-w-[220px] leading-relaxed mb-4'>
							{t('footer.description')}
						</p>
						<div className='flex items-center gap-3'>
							<a
								href='https://www.instagram.com/tarodan.com.tr/'
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center justify-center hover:opacity-80 transition-opacity'
								aria-label='Instagram'>
								<Image
									src='/instagram.png'
									alt='Instagram'
									width={32}
									height={32}
									className='object-contain'
									style={{ borderRadius: '8px' }}
								/>
							</a>
						</div>
					</div>

					{/* Marketplace */}
					<div>
						<h3 className='text-xs font-bold text-heading uppercase tracking-widest mb-3'>
							{t('footer.marketplace')}
						</h3>
						<ul className='space-y-2'>
							{FOOTER_LINKS.marketplace.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className='text-sm text-muted hover:text-primary-500 transition-colors'>
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>

					{/* Support */}
					<div>
						<h3 className='text-xs font-bold text-heading uppercase tracking-widest mb-3'>
							{t('footer.support')}
						</h3>
						<ul className='space-y-2'>
							{FOOTER_LINKS.support.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className='text-sm text-muted hover:text-primary-500 transition-colors'>
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>

					{/* Legal */}
					<div>
						<h3 className='text-xs font-bold text-heading uppercase tracking-widest mb-3'>
							{t('footer.legal')}
						</h3>
						<ul className='space-y-2'>
							{FOOTER_LINKS.legal.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className='text-sm text-muted hover:text-primary-500 transition-colors'>
										{link.label}
									</Link>
								</li>
							))}
							<li>
								<Button
									variant='secondary'
									onClick={() => {
										localStorage.removeItem('cookie_consent');
										window.location.reload();
									}}
									className='text-sm text-muted hover:text-primary-500 transition-colors text-left'>
									{locale === 'en' ? 'Cookie Settings' : 'Çerez Ayarları'}
								</Button>
							</li>
						</ul>
					</div>

					{/* Language */}
					<div>
						<h3 className='text-xs font-bold text-heading uppercase tracking-widest mb-3'>
							{locale === 'en' ? 'Language' : 'Dil'}
						</h3>
						<LanguageSwitcher
							variant='dropdown'
							className='bg-surface-alt border border-border'
						/>
					</div>
				</div>

				{/* Bottom bar */}
				<div className='border-t border-border mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3'>
					<p className='text-xs text-subtle'>
						&copy; {new Date().getFullYear()} TARODAN. {t('footer.copyright')}
					</p>
					<div className='flex items-center gap-3'>
						<span
							className='px-3 py-1 bg-surface-alt text-[10px] font-semibold text-muted uppercase tracking-wide'
							style={{ borderRadius: '2px' }}>
							PayTR
						</span>
						<span
							className='px-3 py-1 bg-surface-alt text-[10px] font-semibold text-muted uppercase tracking-wide'
							style={{ borderRadius: '2px' }}>
							SSL
						</span>
					</div>
				</div>
			</Container>
		</footer>
	);
}
