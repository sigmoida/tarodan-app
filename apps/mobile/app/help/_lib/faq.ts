import { Linking } from 'react-native';
import {
  RETURN_REQUEST_DAYS,
  COMMISSION_SUMMARY,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
} from '../../../src/constants/legalFacts';

export const FAQ_CATEGORIES = [
  {
    id: 'general',
    title: 'Genel',
    icon: 'help-circle-outline',
    questions: [
      {
        q: 'Tarodan nedir?',
        a: 'Tarodan, koleksiyonerlerin diecast model arabalarını alıp satabildiği, takas yapabildiği ve koleksiyonlarını sergileyebildiği bir pazar yeridir.'
      },
      {
        q: 'Nasıl üye olabilirim?',
        a: 'Ana sayfadaki "Üye Ol" butonuna tıklayarak e-posta, telefon ve kişisel bilgilerinizi girerek ücretsiz üyelik oluşturabilirsiniz. Üyeliğinizi doğrulamak için e-posta ve SMS doğrulaması gereklidir.'
      },
      {
        q: 'Premium üyelik ne sağlar?',
        a: 'Premium üyeler sınırsız ilan yayınlayabilir, takas yapabilir, Digital Garage oluşturabilir, öne çıkan ilanlar kullanabilir ve öncelikli destek alabilir.'
      },
    ]
  },
  {
    id: 'buying',
    title: 'Satın Alma',
    icon: 'cart-outline',
    questions: [
      {
        q: 'Üye olmadan alışveriş yapabilir miyim?',
        a: 'Evet! Misafir olarak alışveriş yapabilirsiniz. Siparişiniz e-posta ile takip edilebilir. Ancak favorilere ekleme ve satıcıyla mesajlaşma için üyelik gereklidir.'
      },
      {
        q: 'Ödeme yöntemleri nelerdir?',
        a: 'Kredi kartı, banka kartı ve iyzico bakiyesi ile ödeme yapabilirsiniz. Tüm ödemeler güvenli olarak işlenir ve ürün elinize ulaşana kadar koruma altındadır.'
      },
      {
        q: 'Siparişimi nasıl takip ederim?',
        a: 'Sipariş onay e-postasındaki link ile veya "Sipariş Takip" sayfasından sipariş numaranız ve e-posta adresinizle takip edebilirsiniz.'
      },
      {
        q: 'İade politikası nedir?',
        a: `Ürün açıklamasına uymuyorsa teslim tarihinden itibaren ${RETURN_REQUEST_DAYS} gün içinde iade talep edebilirsiniz. Detaylar için satıcının iade politikasını kontrol edin.`
      },
    ]
  },
  {
    id: 'selling',
    title: 'Satış',
    icon: 'pricetag-outline',
    questions: [
      {
        q: 'Nasıl ilan veririm?',
        a: 'Üye girişi yaptıktan sonra "İlan Ver" butonuna tıklayarak ürün bilgilerini, fotoğraflarını ve fiyatını girerek ilan oluşturabilirsiniz.'
      },
      {
        q: 'İlan ücreti var mı?',
        a: 'Ücretsiz üyeler belirli sayıda (5-10) ücretsiz ilan verebilir. Premium üyeler sınırsız ilan yayınlayabilir.'
      },
      {
        q: 'Komisyon oranı nedir?',
        a: COMMISSION_SUMMARY
      },
      {
        q: 'Ödememi ne zaman alırım?',
        a: 'Alıcı ürünü teslim aldığını onayladıktan 3 iş günü içinde ödemeniz hesabınıza aktarılır.'
      },
    ]
  },
  {
    id: 'trading',
    title: 'Takas',
    icon: 'swap-horizontal',
    questions: [
      {
        q: 'Takas nasıl çalışır?',
        a: 'Premium üyeler "Takas Açık" olarak işaretlenmiş ürünlere takas teklifi gönderebilir. Karşılıklı onay ile takas gerçekleşir.'
      },
      {
        q: 'Takas güvenli mi?',
        a: 'Evet, takas işlemleri platform garantisi altındadır. Her iki taraf da ürünleri göndermeden önce takas onaylanır.'
      },
      {
        q: 'Fark ödemeli takas yapabilir miyim?',
        a: 'Evet, takas teklifinde nakit fark ekleyebilirsiniz. Fark ödemesi güvenli ödeme sistemi üzerinden yapılır.'
      },
    ]
  },
  {
    id: 'account',
    title: 'Hesap',
    icon: 'person-outline',
    questions: [
      {
        q: 'Şifremi unuttum, ne yapmalıyım?',
        a: 'Giriş sayfasındaki "Şifremi Unuttum" linkine tıklayarak e-posta adresinize şifre sıfırlama bağlantısı gönderilmesini sağlayabilirsiniz.'
      },
      {
        q: 'Hesabımı nasıl silerim?',
        a: 'Profil > Ayarlar > Hesap > Hesabı Sil seçeneğinden hesabınızı kalıcı olarak silebilirsiniz. Bu işlem geri alınamaz.'
      },
      {
        q: 'Premium üyeliği nasıl iptal ederim?',
        a: 'Profil > Ayarlar > Üyelik > Aboneliği İptal Et seçeneğinden iptal edebilirsiniz. Mevcut dönem sonuna kadar premium özellikleri kullanmaya devam edersiniz.'
      },
    ]
  },
];

export const CONTACT_OPTIONS = [
  {
    id: 'email',
    title: 'E-posta',
    subtitle: SUPPORT_EMAIL,
    icon: 'mail-outline',
    action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`),
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    subtitle: SUPPORT_WHATSAPP,
    icon: 'logo-whatsapp',
    action: () => Linking.openURL('https://wa.me/905551234567'),
  },
  {
    id: 'phone',
    title: 'Telefon',
    subtitle: SUPPORT_PHONE,
    icon: 'call-outline',
    action: () => Linking.openURL('tel:08501234567'),
  },
];
