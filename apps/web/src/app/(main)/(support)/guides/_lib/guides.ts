/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	UserPlusIcon,
	ShoppingBagIcon,
	CurrencyDollarIcon,
	ArrowsRightLeftIcon,
	CameraIcon,
	TruckIcon,
} from '@heroicons/react/24/outline';

export interface GuideStep {
	title: string;
	content: string;
}

export interface Guide {
	id: string;
	title: string;
	description: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	color: string;
	bgColor: string;
	steps: GuideStep[];
}

export const GUIDES: Guide[] = [
	{
		id: 'getting-started',
		title: 'Başlangıç Rehberi',
		description: 'TARODAN\'a hoş geldiniz! Platformu kullanmaya başlamak için izlemeniz gereken adımlar.',
		icon: UserPlusIcon,
		color: 'text-info-500',
		bgColor: 'bg-info-50',
		steps: [
			{
				title: 'Üye Olun',
				content: 'E-posta adresiniz ve şifrenizle hızlıca üye olun. Google veya Facebook hesabınızla da giriş yapabilirsiniz.',
			},
			{
				title: 'Profilinizi Tamamlayın',
				content: 'Profil fotoğrafı ekleyin, bio yazın ve iletişim bilgilerinizi güncelleyin. Tam profiller daha güvenilir görünür.',
			},
			{
				title: 'Adres Ekleyin',
				content: 'Satın alma ve satış işlemleri için en az bir adres eklemeniz gerekiyor.',
			},
			{
				title: 'Keşfetmeye Başlayın',
				content: 'Kategorileri inceleyin, takip etmek istediğiniz satıcıları bulun ve favorilerinizi kaydedin.',
			},
		],
	},
	{
		id: 'buying',
		title: 'Alışveriş Rehberi',
		description: 'TARODAN\'da güvenle alışveriş yapmanın tüm detayları.',
		icon: ShoppingBagIcon,
		color: 'text-success-500',
		bgColor: 'bg-success-50',
		steps: [
			{
				title: 'Ürün Arama',
				content: 'Arama çubuğunu kullanarak marka, model veya anahtar kelime ile arama yapın. Filtreler ile sonuçları daraltın.',
			},
			{
				title: 'Ürün Detaylarını İnceleyin',
				content: 'Fotoğrafları yakından inceleyin, açıklamayı okuyun, satıcı puanını kontrol edin. Sorularınız varsa mesaj gönderin.',
			},
			{
				title: 'Sepete Ekleyin',
				content: '"Sepete Ekle" butonuna tıklayın. Birden fazla ürünü aynı anda satın alabilirsiniz.',
			},
			{
				title: 'Ödeme Yapın',
				content: 'Adres seçin, kargo seçeneğini belirleyin ve güvenli ödeme sayfasında işleminizi tamamlayın.',
			},
			{
				title: 'Siparişi Takip Edin',
				content: '"Siparişlerim" sayfasından kargo durumunu gerçek zamanlı takip edin.',
			},
		],
	},
	{
		id: 'selling',
		title: 'Satış Rehberi',
		description: 'Model arabalarınızı satışa sunmanın A\'dan Z\'ye tüm aşamaları.',
		icon: CurrencyDollarIcon,
		color: 'text-warning-500',
		bgColor: 'bg-warning-50',
		steps: [
			{
				title: 'İlan Ver Butonuna Tıklayın',
				content: 'Ana sayfada veya menüde "İlan Ver" butonuna tıklayarak ilan oluşturma sayfasına gidin.',
			},
			{
				title: 'Fotoğraf Yükleyin',
				content: 'En az 3 fotoğraf yükleyin. Farklı açılardan, iyi ışıkta çekilmiş fotoğraflar satışı artırır.',
			},
			{
				title: 'Detayları Girin',
				content: 'Marka, model, ölçek, durum ve açıklama bilgilerini eksiksiz doldurun. Ne kadar detay o kadar güven.',
			},
			{
				title: 'Fiyat Belirleyin',
				content: 'Piyasa araştırması yapın, rekabetçi bir fiyat belirleyin. Takas seçeneğini de aktif edebilirsiniz.',
			},
			{
				title: 'İlanı Yayınlayın',
				content: 'İlanınız onay sürecinden geçtikten sonra yayına alınır (genellikle 24 saat içinde).',
			},
			{
				title: 'Satış Gerçekleşti!',
				content: 'Ürünü dikkatlice paketleyin, kargoya verin ve takip numarasını sisteme girin.',
			},
		],
	},
	{
		id: 'trade',
		title: 'Takas Rehberi',
		description: 'Model araba takası yapmak için adım adım kılavuz.',
		icon: ArrowsRightLeftIcon,
		color: 'text-primary-500',
		bgColor: 'bg-primary-50',
		steps: [
			{
				title: 'Takasa Açık Ürünleri Bulun',
				content: 'Ürün listelerinde "Takasa Açık" etiketine dikkat edin. Bu ürünlere takas teklifi gönderebilirsiniz.',
			},
			{
				title: 'Teklif Gönderin',
				content: '"Takas Teklifi" butonuna tıklayın, kendi ürünlerinizden birini seçin ve teklif gönderin.',
			},
			{
				title: 'Mesajlaşın',
				content: 'Karşı tarafla detayları görüşün. Fark varsa ek ödeme konusunda anlaşın.',
			},
			{
				title: 'Takası Onaylayın',
				content: 'Her iki taraf da onayladığında takas kesinleşir.',
			},
			{
				title: 'Karşılıklı Gönderim',
				content: 'Ürünlerinizi aynı anda kargoya verin ve takip numaralarını paylaşın.',
			},
		],
	},
	{
		id: 'photography',
		title: 'Fotoğraf Çekim Rehberi',
		description: 'İlanlarınız için profesyonel fotoğraflar çekmek.',
		icon: CameraIcon,
		color: 'text-danger-500',
		bgColor: 'bg-danger-50',
		steps: [
			{
				title: 'Işık Çok Önemli',
				content: 'Doğal ışık kullanın, pencere kenarında gündüz çekim yapın. Flash kullanmaktan kaçının.',
			},
			{
				title: 'Arka Plan',
				content: 'Sade, tek renkli bir arka plan kullanın. Beyaz kağıt veya kumaş işinizi görür.',
			},
			{
				title: 'Farklı Açılar',
				content: 'Ön, arka, yan ve 45 derece açılardan fotoğraf çekin. Detayları gösterin.',
			},
			{
				title: 'Kusurları Gösterin',
				content: 'Çizik, eksik parça gibi kusurlar varsa yakından fotoğraflayın. Şeffaflık güven sağlar.',
			},
			{
				title: 'Ambalaj Fotoğrafı',
				content: 'Orijinal kutusu varsa mutlaka fotoğraflayın. Koleksiyoncular için çok değerli.',
			},
		],
	},
	{
		id: 'shipping',
		title: 'Paketleme ve Kargo Rehberi',
		description: 'Ürünlerinizi güvenle göndermenin yolları.',
		icon: TruckIcon,
		color: 'text-primary-500',
		bgColor: 'bg-primary-50',
		steps: [
			{
				title: 'Koruyucu Malzeme',
				content: 'Baloncuklu naylon, köpük veya gazete kağıdı ile ürünü sarın. Hareket etmemeli.',
			},
			{
				title: 'Sağlam Kutu',
				content: 'Ürüne uygun boyutta, sağlam bir karton kutu seçin. Çok büyük kutu tehlikelidir.',
			},
			{
				title: 'Çift Kat Koruma',
				content: 'Özellikle değerli parçalar için iç içe iki kutu kullanın.',
			},
			{
				title: 'Etiketleme',
				content: 'Adres bilgilerini okunaklı yazın, "KIRILACAK EŞYA" etiketi ekleyin.',
			},
			{
				title: 'Kargoya Verin',
				content: 'Sürat Kargo şubesine götürün, takip numarasını sisteme girin.',
			},
		],
	},
];
