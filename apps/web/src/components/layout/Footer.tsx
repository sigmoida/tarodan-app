/** @format */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
	useLanguage,
	localeNames,
	localeFlags,
	type Locale,
} from '@/i18n/LanguageContext';
import { Button, Select } from '@tarodan/ui';
import { Container } from './Container';

const LOCALES: Locale[] = ['tr', 'en'];

const SOCIAL_LINKS = [
	{ label: 'X', href: 'https://x.com' },
	{ label: 'Instagram', href: 'https://www.instagram.com/tarodan.com.tr/' },
	{ label: 'Facebook', href: 'https://facebook.com' },
	{ label: 'TikTok', href: 'https://www.tiktok.com' },
];

export default function Footer() {
	const { t, locale, setLocale } = useLanguage();

	const clearCookieConsent = () => {
		localStorage.removeItem('cookie_consent');
		window.location.reload();
	};

	// Bilingual label helper — footer entries mirror each page's own title, so a
	// page reads the same in the footer as in its heading.
	const L = (tr: string, en: string) => (locale === 'en' ? en : tr);

	// Footer columns mirror the route-group taxonomy 1:1 (marketplace shortcuts +
	// corporate / support / trust / shopping / legal). New categories simply wrap
	// onto the next row of the grid below.
	const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
		{
			title: L('Pazar Yeri', 'Marketplace'),
			links: [
				{ href: '/listings', label: t('nav.listings') },
				{ href: '/profile/trades', label: t('nav.trades') },
				{ href: '/collections', label: t('nav.collections') },
				{ href: '/membership', label: t('membership.title') },
			],
		},
		{
			title: L('Kurumsal', 'Corporate'),
			links: [
				{ href: '/about', label: L('Hakkımızda', 'About Us') },
				{ href: '/contact', label: L('İletişim', 'Contact') },
				{ href: '/newsletter', label: L('Bülten Aboneliği', 'Newsletter') },
				{ href: '/sitemap', label: L('Site Haritası', 'Sitemap') },
			],
		},
		{
			title: L('Yardım & Destek', 'Help & Support'),
			links: [
				{ href: '/help', label: L('Yardım Merkezi', 'Help Center') },
				{ href: '/support', label: L('Destek Merkezi', 'Support Center') },
				{ href: '/faq', label: L('Sıkça Sorulan Sorular', 'FAQ') },
				{ href: '/guides', label: L('Rehberler', 'Guides') },
				{ href: '/collectors-guide', label: L('Koleksiyoncu Rehberi', "Collector's Guide") },
				{ href: '/size-guide', label: L('Ölçek Rehberi', 'Scale Guide') },
			],
		},
		{
			title: L('Güven & Güvenlik', 'Trust & Safety'),
			links: [
				{ href: '/secure-swap', label: L('Güvenli Takas', 'Secure Swap') },
				{ href: '/buyer-protection', label: L('Alıcı Koruması', 'Buyer Protection') },
				{ href: '/authenticity', label: L('Orijinallik Garantisi', 'Authenticity') },
				{ href: '/security-features', label: L('Güvenlik Özellikleri', 'Security Features') },
			],
		},
		{
			title: L('Alışveriş', 'Shopping'),
			links: [
				{ href: '/payment-options', label: L('Ödeme Seçenekleri', 'Payment Options') },
				{ href: '/shipping-delivery', label: L('Kargo & Teslimat', 'Shipping & Delivery') },
				{ href: '/returns-exchanges', label: L('İade & Değişim', 'Returns & Exchanges') },
				{ href: '/sell', label: L('Satış Yap', 'Sell') },
				{ href: '/platform-service-fee', label: L('Platform Hizmet Bedeli', 'Platform Service Fee') },
			],
		},
		{
			title: L('Yasal', 'Legal'),
			links: [
				{ href: '/terms', label: L('Kullanım Koşulları', 'Terms of Use') },
				{ href: '/privacy', label: L('Gizlilik Politikası', 'Privacy Policy') },
				{ href: '/cookies', label: L('Çerez Politikası', 'Cookie Policy') },
				{ href: '/distance-sales', label: L('Mesafeli Satış Sözleşmesi', 'Distance Sales Agreement') },
				{ href: '/refund-policy', label: L('İade Politikası', 'Refund Policy') },
				{ href: '/seller-agreement', label: L('Satıcı Sözleşmesi', 'Seller Agreement') },
				{ href: '/intellectual-property', label: L('Fikri Mülkiyet Hakları', 'Intellectual Property') },
			],
		},
	];

	return (
		<footer className='bg-surface-elevated border-t border-border'>
			<Container className='pt-16'>
				{/* Brand + app download */}
				<div className='mb-12 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between'>
					<div>
						<Link href='/' className='mb-3 inline-block'>
							<Image
								src='/tarodan-logo.jpg'
								alt='Tarodan'
								width={162}
								height={40}
								className='rounded-lg object-contain'
							/>
						</Link>
						<p className='max-w-[320px] text-xs leading-relaxed text-muted'>
							{t('footer.description')}
						</p>
					</div>

					{/* App stores — grab the app on iOS / Android */}
					<div className='sm:text-right'>
						<p className='mb-3 text-sm font-medium text-heading'>
							{L(
								'Tarodan’ı cebinize taşıyın — mobil uygulamamızı indirin',
								'Take Tarodan with you — download our mobile app',
							)}
						</p>
						{/* Both official badges fill their whole viewBox (no built-in
						    padding), so the SAME rendered height makes the buttons match;
						    only the widths differ (different aspect ratios). Pass each true
						    intrinsic size so no layout shift, and items-center aligns them. */}
						<div className='flex items-center gap-2 sm:justify-end'>
							<Image
								src='/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg'
								alt={L('App Store’dan indirin', 'Download on the App Store')}
								width={120}
								height={40}
								className='h-11 w-auto'
							/>
							<Image
								src='/GetItOnGooglePlay_Badge_Web_color_English.svg'
								alt={L('Google Play’den indirin', 'Get it on Google Play')}
								width={239}
								height={71}
								className='h-11 w-auto'
							/>
						</div>
					</div>
				</div>

				{/* Category columns — new categories wrap onto the next row */}
				<div className='grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4'>
					{FOOTER_COLUMNS.map((col) => (
						<div key={col.title}>
							<h3 className='mb-3 text-xs font-bold uppercase tracking-widest text-heading'>
								{col.title}
							</h3>
							<ul className='space-y-2'>
								{col.links.map((link) => (
									<li key={link.href}>
										<Link
											href={link.href}
											className='text-sm text-muted transition-colors hover:text-primary-500'>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}

					{/* Follow us */}
					<div>
						<h3 className='mb-3 text-xs font-bold uppercase tracking-widest text-heading'>
							{L('Bizi Takip Edin', 'Follow Us')}
						</h3>
						<ul className='space-y-2'>
							{SOCIAL_LINKS.map((s) => (
								<li key={s.label}>
									<a
										href={s.href}
										target='_blank'
										rel='noopener noreferrer'
										className='text-sm text-muted transition-colors hover:text-primary-500'>
										{s.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>

				{/* Bottom bar */}
				<div className='border-t border-border mt-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-3'>
					<p className='text-xs text-subtle'>
						&copy; {new Date().getFullYear()} TARODAN. {t('footer.copyright')}
					</p>
					<div className='flex items-center gap-3'>
						<Select
							value={locale}
							onChange={(e) => setLocale(e.target.value as Locale)}
							selectSize='sm'
							aria-label={locale === 'en' ? 'Language' : 'Dil'}
							className='w-auto'>
							{LOCALES.map((l) => (
								<option key={l} value={l}>
									{localeFlags[l]} {localeNames[l]}
								</option>
							))}
						</Select>
						<Button
							variant='ghost'
							size='sm'
							onClick={clearCookieConsent}
							className='text-xs text-muted'>
							{locale === 'en' ? 'Cookie Settings' : 'Çerez Ayarları'}
						</Button>
						<Image
							src='/idHcfrz3L6_1783526429272.svg'
							alt={locale === 'en' ? 'Secure payment' : 'Güvenli ödeme'}
							width={135}
							height={24}
							className='h-5 w-auto'
						/>
					</div>
				</div>
			</Container>
		</footer>
	);
}
