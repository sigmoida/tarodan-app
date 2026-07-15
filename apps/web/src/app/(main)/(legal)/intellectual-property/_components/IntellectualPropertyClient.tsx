'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function IntellectualPropertyClient() {
	const t = useTranslations();

	return (
		<DocPage
			title={t('legal.intellectualPropertyTitle')}
			description={`${t('legal.lastUpdated')}: 24 Ocak 2026`}>
			<SectionCard>
				<div className='prose prose-gray max-w-none'>
					<h2>1. Genel İlke</h2>
					<p>
						TARODAN, üçüncü kişilerin telif hakkı, marka ve diğer fikri mülkiyet
						haklarına saygı gösterilmesini bekler. Platformda yayınlanan içeriklerin
						(metin, görsel, logo) hak sahibi izni veya yasal kullanım hakkı ile
						paylaşılması gerekir. İhlal tespit edildiğinde içerik kaldırılır ve
						tekrarlayan ihlallerde hesap işlemleri yapılabilir.
					</p>

					<h2>2. Platformun Fikri Mülkiyeti</h2>
					<p>
						TARODAN adı, logosu, arayüz tasarımı, metinleri ve bu siteye ait özgün
						içerikler TARODAN Teknoloji A.Ş. veya lisans verenlerine aittir. İzinsiz
						kopyalama, dağıtma veya ticari kullanım yasaktır.
					</p>

					<h2>3. Kullanıcı ve Satıcı İçerikleri</h2>
					<p>
						Kullanıcılar ve satıcılar, yükledikleri metin ve görsellerin kullanım
						hakkına sahip olduklarını veya gerekli izinlere sahip olduklarını kabul
						eder. Platforma yüklenen içerikler, hizmetin sunulması (ilanların
						gösterilmesi, arama, pazarlama) amacıyla işlenebilir ve sınırlı lisans
						kapsamında kullanılabilir.
					</p>

					<h2>4. Telif Hakkı İhlali Bildirimi (DMCA / Uyumlu Süreç)</h2>
					<p>
						Telif hakkı ihlali olduğunu düşündüğünüz bir içerik varsa, aşağıdaki
						bilgilerle bize yazılı bildirim yapabilirsiniz. Bildirimde:
					</p>
					<ul>
						<li>İhlal edildiğini iddia ettiğiniz eserin tanımı ve (varsa) orijinal linki</li>
						<li>Platformdaki ihlal içeriğinin konumu (URL, ilan no)</li>
						<li>İletişim bilgileriniz (ad, e-posta, telefon)</li>
						<li>İçeriğin izniniz olmadan kullanıldığına dair iyi niyetli inanç beyanı</li>
						<li>Beyanlarınızın doğruluğuna dair yanlış bilgi verme sorumluluğu kabulü</li>
					</ul>
					<p>
						<strong>Bildirim adresi:</strong> legal@tarodan.com (konu: Telif Hakkı İhlali).
						Geçerli ve eksiksiz bildirimler değerlendirilir; uygunsa içerik
						kaldırılır ve (yasalara uygun şekilde) karşı tarafa bildirim yapılabilir.
					</p>

					<h2>5. Marka Kullanımı</h2>
					<p>
						Ürün ilanlarında marka isimleri, orijinal ürünü tanımlama amacıyla
						makul ölçüde kullanılabilir. Ticari marka sahiplerinin haklarına
						saygı gösterilmesi gerekir; taklit, yanıltıcı kullanım veya marka
						ihlali kabul edilmez. Marka ihlali iddiaları için legal@tarodan.com
						adresine bildirim yapılabilir.
					</p>

					<h2>6. Tekrarlayan İhlalciler</h2>
					<p>
						Geçerli ihlal bildirimleri sonrasında tekrarlayan ihlal yapan
						kullanıcı hesapları askıya alınabilir veya sonlandırılabilir.
					</p>

					<h2>7. İletişim</h2>
					<p>
						Fikri mülkiyet ve ihlal bildirimleri: legal@tarodan.com
					</p>
				</div>
			</SectionCard>

			<div className='flex flex-wrap gap-4'>
				<Link href='/terms' className='text-primary-500 hover:underline'>Kullanım Şartları →</Link>
				<Link href='/seller-agreement' className='text-primary-500 hover:underline'>Satıcı Sözleşmesi →</Link>
			</div>
		</DocPage>
	);
}
