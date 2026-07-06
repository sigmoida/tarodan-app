'use client';

import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button, Checkbox } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { DocPage } from '@/components/layout/DocPage';

const COOKIE_CATEGORIES = [
	{
		id: 'necessary',
		name: 'Zorunlu Çerezler',
		description:
			'Platformun temel işlevleri için gereklidir. Devre dışı bırakılamaz.',
		required: true,
		cookies: [
			{ name: 'session_id', purpose: 'Oturum yönetimi', duration: 'Oturum süresi' },
			{ name: 'csrf_token', purpose: 'Güvenlik (CSRF koruması)', duration: 'Oturum süresi' },
			{ name: 'cookie_consent', purpose: 'Çerez tercihlerinin saklanması', duration: '1 yıl' },
		],
	},
	{
		id: 'functional',
		name: 'İşlevsel Çerezler',
		description:
			'Tercihlerinizi hatırlamamıza ve daha iyi deneyim sunmamıza yardımcı olur.',
		required: false,
		cookies: [
			{ name: 'user_preferences', purpose: 'Dil ve tema tercihleri', duration: '1 yıl' },
			{ name: 'recent_searches', purpose: 'Son aramalarınız', duration: '30 gün' },
			{ name: 'cart_items', purpose: 'Sepet içeriği (misafir)', duration: '7 gün' },
		],
	},
	{
		id: 'analytics',
		name: 'Analitik Çerezler',
		description:
			'Platformun nasıl kullanıldığını anlamamıza ve iyileştirmemize yardımcı olur.',
		required: false,
		cookies: [
			{ name: '_ga', purpose: 'Google Analytics - Kullanıcı kimliği', duration: '2 yıl' },
			{ name: '_gid', purpose: 'Google Analytics - Oturum kimliği', duration: '24 saat' },
			{ name: 'analytics_user', purpose: 'Dahili analitik', duration: '1 yıl' },
		],
	},
	{
		id: 'marketing',
		name: 'Pazarlama Çerezleri',
		description: 'Kişiselleştirilmiş reklamlar göstermek için kullanılır.',
		required: false,
		cookies: [
			{ name: '_fbp', purpose: 'Facebook Pixel', duration: '90 gün' },
			{ name: 'ads_prefs', purpose: 'Reklam tercihleri', duration: '1 yıl' },
		],
	},
];

const DOC_LINKS = [
	{ href: '/terms', label: 'Kullanım Şartları' },
	{ href: '/privacy', label: 'Gizlilik Politikası' },
	{ href: '/distance-sales', label: 'Mesafeli Satış Sözleşmesi' },
];

export default function CookiesPage() {
	const { t } = useTranslation();
	const [preferences, setPreferences] = useState({
		functional: true,
		analytics: true,
		marketing: false,
	});

	const handlePreferenceChange = (category: string) => {
		setPreferences((prev) => ({
			...prev,
			[category]: !prev[category as keyof typeof prev],
		}));
	};

	const savePreferences = () => {
		localStorage.setItem('cookie_preferences', JSON.stringify(preferences));
		toast.success(t('common.success'));
	};

	return (
		<DocPage
			title={t('legal.cookiesTitle')}
			description={`${t('legal.lastUpdated')}: 24 Ocak 2026`}>
			{/* Intro */}
			<SectionCard>
				<div className='prose prose-gray max-w-none'>
					<h2>1. Çerez Nedir?</h2>
					<p>
						Çerezler, web siteleri tarafından cihazınıza yerleştirilen küçük metin
						dosyalarıdır. Bu dosyalar, sizi tanımamıza, tercihlerinizi hatırlamamıza
						ve size daha iyi bir deneyim sunmamıza yardımcı olur.
					</p>

					<h2>2. Neden Çerez Kullanıyoruz?</h2>
					<ul>
						<li>Platformun düzgün çalışmasını sağlamak</li>
						<li>Oturumunuzu güvenli tutmak</li>
						<li>Tercihlerinizi hatırlamak</li>
						<li>Alışveriş sepetinizi korumak</li>
						<li>Platformu nasıl kullandığınızı anlayıp iyileştirmek</li>
						<li>Size özel içerik ve reklamlar sunmak</li>
					</ul>

					<h2>3. Çerez Türleri</h2>
					<h3>3.1 Süreye Göre</h3>
					<ul>
						<li>
							<strong>Oturum Çerezleri:</strong> Tarayıcınızı kapattığınızda
							otomatik olarak silinir.
						</li>
						<li>
							<strong>Kalıcı Çerezler:</strong> Belirlenen süre boyunca cihazınızda
							kalır.
						</li>
					</ul>
					<h3>3.2 Kaynağa Göre</h3>
					<ul>
						<li>
							<strong>Birinci Taraf Çerezler:</strong> TARODAN tarafından doğrudan
							yerleştirilir.
						</li>
						<li>
							<strong>Üçüncü Taraf Çerezler:</strong> Hizmet sağlayıcılarımız (Google
							Analytics, Facebook vb.) tarafından yerleştirilir.
						</li>
					</ul>
				</div>
			</SectionCard>

			{/* Preferences */}
			<SectionCard title='4. Çerez Kategorileri ve Tercihler'>
				<div className='space-y-6'>
					{COOKIE_CATEGORIES.map((category) => (
						<div
							key={category.id}
							className='border border-border rounded-xl overflow-hidden'>
							<div className='p-4 bg-surface flex items-center justify-between gap-4'>
								<div>
									<h3 className='font-semibold text-heading'>{category.name}</h3>
									<p className='text-sm text-muted'>{category.description}</p>
								</div>
								<label className='relative inline-flex items-center cursor-pointer flex-shrink-0'>
									<Checkbox
										checked={
											category.required ||
											preferences[category.id as keyof typeof preferences]
										}
										onChange={() =>
											!category.required && handlePreferenceChange(category.id)
										}
										disabled={category.required}
										className='sr-only peer'
									/>
									<div
										className={`w-11 h-6 rounded-full peer ${
											category.required
												? 'bg-subtle cursor-not-allowed'
												: 'bg-border-subtle peer-checked:bg-primary-500'
										} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-elevated after:rounded-full after:h-5 after:w-5 after:transition-all`}
									/>
								</label>
							</div>
							<div className='p-4 overflow-x-auto'>
								<table className='w-full text-sm'>
									<thead>
										<tr className='text-left text-muted'>
											<th className='pb-2'>Çerez Adı</th>
											<th className='pb-2'>Amaç</th>
											<th className='pb-2'>Süre</th>
										</tr>
									</thead>
									<tbody className='text-body'>
										{category.cookies.map((cookie) => (
											<tr
												key={cookie.name}
												className='border-t border-border-subtle'>
												<td className='py-2 font-mono text-xs'>{cookie.name}</td>
												<td className='py-2'>{cookie.purpose}</td>
												<td className='py-2'>{cookie.duration}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					))}
				</div>

				<div className='mt-6 flex flex-wrap gap-3'>
					<Button variant='primary' onClick={savePreferences}>
						{t('legal.savePreferences')}
					</Button>
					<Button
						variant='secondary'
						onClick={() =>
							setPreferences({
								functional: true,
								analytics: true,
								marketing: true,
							})
						}>
						{t('legal.acceptAll')}
					</Button>
				</div>
			</SectionCard>

			{/* How to control */}
			<SectionCard>
				<div className='prose prose-gray max-w-none'>
					<h2>5. Çerezleri Nasıl Kontrol Edebilirsiniz?</h2>
					<h3>5.1 Tarayıcı Ayarları</h3>
					<p>
						Çoğu tarayıcı, çerezleri kontrol etmenize olanak tanır. Tarayıcı
						ayarlarından:
					</p>
					<ul>
						<li>Tüm çerezleri engelleyebilirsiniz</li>
						<li>Yalnızca üçüncü taraf çerezleri engelleyebilirsiniz</li>
						<li>Mevcut çerezleri silebilirsiniz</li>
						<li>Her çerez yerleştirildiğinde uyarı alabilirsiniz</li>
					</ul>
					<h3>5.2 Tarayıcı Bağlantıları</h3>
					<ul>
						<li>
							<a
								href='https://support.google.com/chrome/answer/95647'
								target='_blank'
								rel='noopener noreferrer'>
								Google Chrome
							</a>
						</li>
						<li>
							<a
								href='https://support.mozilla.org/tr/kb/cerezleri-etkinlestirme-ve-devre-disi-birakma'
								target='_blank'
								rel='noopener noreferrer'>
								Mozilla Firefox
							</a>
						</li>
						<li>
							<a
								href='https://support.apple.com/tr-tr/guide/safari/sfri11471/mac'
								target='_blank'
								rel='noopener noreferrer'>
								Apple Safari
							</a>
						</li>
						<li>
							<a
								href='https://support.microsoft.com/tr-tr/microsoft-edge'
								target='_blank'
								rel='noopener noreferrer'>
								Microsoft Edge
							</a>
						</li>
					</ul>
					<h3>5.3 Mobil Cihazlar</h3>
					<p>
						Mobil cihazlarda çerez ayarlarını tarayıcı veya cihaz ayarlarından
						yönetebilirsiniz.
					</p>
				</div>

				<div className='mt-4 p-4 bg-warning-50 rounded-lg border border-warning-200'>
					<p className='text-sm text-warning-800'>
						<strong>Önemli:</strong> Zorunlu çerezleri devre dışı bırakmanız halinde
						platformun bazı özellikleri düzgün çalışmayabilir.
					</p>
				</div>

				<div className='prose prose-gray max-w-none mt-6'>
					<h2>6. Üçüncü Taraf Çerezleri</h2>
					<p>Aşağıdaki üçüncü taraf hizmetlerin çerezlerini kullanıyoruz:</p>
					<ul>
						<li>
							<strong>Google Analytics:</strong> Web analizi için (
							<a
								href='https://policies.google.com/privacy'
								target='_blank'
								rel='noopener noreferrer'>
								Gizlilik Politikası
							</a>
							)
						</li>
						<li>
							<strong>Iyzico:</strong> Ödeme işlemleri için (
							<a
								href='https://www.iyzico.com/gizlilik-politikasi'
								target='_blank'
								rel='noopener noreferrer'>
								Gizlilik Politikası
							</a>
							)
						</li>
						<li>
							<strong>Facebook Pixel:</strong> Reklam ve analiz için (
							<a
								href='https://www.facebook.com/privacy/explanation'
								target='_blank'
								rel='noopener noreferrer'>
								Gizlilik Politikası
							</a>
							)
						</li>
					</ul>

					<h2>7. Politika Güncellemeleri</h2>
					<p>
						Bu politikayı gerektiğinde güncelleyebiliriz. Önemli değişiklikler
						platformda duyurulur ve bu sayfada yayınlanır.
					</p>

					<h2>8. İletişim</h2>
					<p>Çerez politikamız hakkında sorularınız için:</p>
					<ul>
						<li>
							<strong>E-posta:</strong> destek@tarodan.com
						</li>
						<li>
							<strong>Telefon:</strong> 0850 XXX XX XX
						</li>
					</ul>
				</div>
			</SectionCard>

			{/* Related docs */}
			<div className='flex flex-wrap gap-4'>
				{DOC_LINKS.map((l) => (
					<Link
						key={l.href}
						href={l.href}
						className='text-sm text-primary-500 hover:underline'>
						{l.label} →
					</Link>
				))}
			</div>
		</DocPage>
	);
}
