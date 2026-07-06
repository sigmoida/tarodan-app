'use client';

import Link from 'next/link';
import {
	QuestionMarkCircleIcon,
	ShoppingCartIcon,
	CurrencyDollarIcon,
	ArrowsRightLeftIcon,
	TruckIcon,
	ShieldCheckIcon,
	UserCircleIcon,
	CreditCardIcon,
	ChatBubbleLeftRightIcon,
	DocumentTextIcon,
	PhoneIcon,
	EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { SectionCard } from '@/components/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DocPage } from '@/components/layout/DocPage';

const HELP_CATEGORIES = [
	{
		title: 'Başlangıç',
		description: "TARODAN'a yeni misiniz? Buradan başlayın.",
		icon: QuestionMarkCircleIcon,
		color: 'bg-info-500',
		links: [
			{ href: '/guides', label: 'Kullanım Kılavuzu' },
			{ href: '/faq', label: 'Sıkça Sorulan Sorular' },
			{ href: '/register', label: 'Üye Olun' },
		],
	},
	{
		title: 'Satın Alma',
		description: 'Ürün arama, sipariş verme ve ödeme işlemleri.',
		icon: ShoppingCartIcon,
		color: 'bg-success-500',
		links: [
			{ href: '/faq#buying', label: 'Nasıl Alışveriş Yapılır?' },
			{ href: '/faq#shipping', label: 'Kargo Bilgileri' },
			{ href: '/faq#buying', label: 'Ödeme Yöntemleri' },
		],
	},
	{
		title: 'Satış Yapma',
		description: 'İlan verme ve satış süreçleri hakkında.',
		icon: CurrencyDollarIcon,
		color: 'bg-warning-500',
		links: [
			{ href: '/guides#selling', label: 'İlan Verme Rehberi' },
			{ href: '/faq#selling', label: 'Komisyon Oranları' },
			{ href: '/pricing', label: 'Üyelik Planları' },
		],
	},
	{
		title: 'Takas',
		description: 'Model araba takas işlemleri.',
		icon: ArrowsRightLeftIcon,
		color: 'bg-primary-500',
		links: [
			{ href: '/faq#trade', label: 'Takas Nasıl Çalışır?' },
			{ href: '/guides#trade', label: 'Takas Rehberi' },
			{ href: '/profile/trades', label: 'Takaslarım' },
		],
	},
	{
		title: 'Kargo ve Teslimat',
		description: 'Gönderim ve teslimat süreçleri.',
		icon: TruckIcon,
		color: 'bg-primary-500',
		links: [
			{ href: '/faq#shipping', label: 'Kargo Takibi' },
			{ href: '/faq#shipping', label: 'Teslimat Süreleri' },
			{ href: '/faq#shipping', label: 'Hasarlı Ürün' },
		],
	},
	{
		title: 'Güvenlik',
		description: 'Hesap güvenliği ve gizlilik.',
		icon: ShieldCheckIcon,
		color: 'bg-danger-500',
		links: [
			{ href: '/faq#account', label: 'Şifre İşlemleri' },
			{ href: '/privacy', label: 'Gizlilik Politikası' },
			{ href: '/profile/security', label: 'Güvenlik Ayarları' },
		],
	},
	{
		title: 'Hesap',
		description: 'Profil ve hesap yönetimi.',
		icon: UserCircleIcon,
		color: 'bg-info-500',
		links: [
			{ href: '/profile', label: 'Profil Düzenleme' },
			{ href: '/profile', label: 'Adres Yönetimi' },
			{ href: '/faq#account', label: 'Hesap Silme' },
		],
	},
	{
		title: 'Ödeme',
		description: 'Ödeme ve iade işlemleri.',
		icon: CreditCardIcon,
		color: 'bg-success-500',
		links: [
			{ href: '/faq#buying', label: 'Ödeme Yöntemleri' },
			{ href: '/profile/payments', label: 'Ödeme Geçmişi' },
			{ href: '/contact', label: 'İade Talebi' },
		],
	},
];

const POPULAR_TOPICS = [
	{ q: 'İlk satışımı nasıl yaparım?', href: '/guides#selling' },
	{ q: '500 TL üzeri ücretsiz kargo nasıl çalışır?', href: '/faq#buying' },
	{ q: 'Takas teklifi nasıl gönderirim?', href: '/faq#trade' },
	{ q: 'Üyelik planları arasındaki farklar nelerdir?', href: '/pricing' },
	{ q: 'Siparişimi nasıl takip ederim?', href: '/faq#shipping' },
	{ q: 'İade ve değişim politikası nedir?', href: '/terms' },
];

const QUICK_LINKS = [
	{ href: '/faq', label: 'Sıkça Sorulan Sorular', icon: QuestionMarkCircleIcon },
	{ href: '/guides', label: 'Kullanım Kılavuzları', icon: DocumentTextIcon },
	{ href: '/contact', label: 'İletişim Formu', icon: ChatBubbleLeftRightIcon },
];

const QUICK_LINKS_EN = [
	{ href: '/faq', label: 'Frequently Asked Questions', icon: QuestionMarkCircleIcon },
	{ href: '/guides', label: 'User Guides', icon: DocumentTextIcon },
	{ href: '/contact', label: 'Contact Form', icon: ChatBubbleLeftRightIcon },
];

export default function HelpCenterPage() {
	const { t, locale } = useTranslation();
	const quickLinks = locale === 'en' ? QUICK_LINKS_EN : QUICK_LINKS;

	return (
		<DocPage
			title={t('help.title')}
			description={t('help.subtitle')}
			actions={
				<div className='flex flex-wrap gap-2'>
					{quickLinks.map((link) => (
						<ButtonLink
							key={link.label}
							variant='secondary'
							size='sm'
							href={link.href}
							className='gap-1.5'>
							<link.icon className='w-4 h-4' />
							{link.label}
						</ButtonLink>
					))}
				</div>
			}>
			{/* Help category grid */}
			<div className='grid md:grid-cols-2 lg:grid-cols-4 gap-4'>
				{HELP_CATEGORIES.map((category) => (
					<SectionCard key={category.title}>
						<div
							className={`w-12 h-12 ${category.color} rounded-xl flex items-center justify-center mb-4`}>
							<category.icon className='w-6 h-6 text-inverted' />
						</div>
						<h3 className='font-semibold text-heading mb-2'>{category.title}</h3>
						<p className='text-sm text-muted mb-4'>{category.description}</p>
						<ul className='space-y-2'>
							{category.links.map((link) => (
								<li key={link.label}>
									<Link
										href={link.href}
										className='text-sm text-primary-500 hover:text-primary-600 hover:underline'>
										{link.label} →
									</Link>
								</li>
							))}
						</ul>
					</SectionCard>
				))}
			</div>

			{/* Popular topics */}
			<SectionCard title={t('help.popularTopics')}>
				<div className='grid md:grid-cols-2 gap-3'>
					{POPULAR_TOPICS.map((item) => (
						<Link
							key={item.q}
							href={item.href}
							className='flex items-center gap-3 p-4 rounded-lg border border-border-subtle hover:border-primary-200 hover:bg-primary-50 transition-colors'>
							<QuestionMarkCircleIcon className='w-5 h-5 text-primary-500 flex-shrink-0' />
							<span className='text-body'>{item.q}</span>
						</Link>
					))}
				</div>
			</SectionCard>

			{/* Still need help */}
			<SectionCard title={t('help.needMoreHelp')}>
				<div className='grid md:grid-cols-2 gap-6 items-center'>
					<div>
						<p className='text-muted mb-4'>
							{t('help.supportReady')} {t('help.businessHours')}
						</p>
						<div className='space-y-2 text-sm text-body'>
							<div className='flex items-center gap-3'>
								<EnvelopeIcon className='w-5 h-5 text-primary-500' />
								<span>destek@tarodan.com</span>
							</div>
							<div className='flex items-center gap-3'>
								<PhoneIcon className='w-5 h-5 text-primary-500' />
								<span>0850 XXX XX XX</span>
							</div>
						</div>
					</div>
					<div className='flex flex-col sm:flex-row gap-3'>
						<ButtonLink
							variant='primary'
							href='/contact'
							className='flex-1 gap-1.5'>
							<ChatBubbleLeftRightIcon className='w-5 h-5' />
							{t('help.contactForm')}
						</ButtonLink>
						<ButtonLink
							variant='secondary'
							href='/faq'
							className='flex-1 gap-1.5'>
							<QuestionMarkCircleIcon className='w-5 h-5' />
							{t('footer.faq')}
						</ButtonLink>
					</div>
				</div>
			</SectionCard>
		</DocPage>
	);
}
