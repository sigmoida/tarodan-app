import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const FAQ_ITEMS = [
  {
    category: 'Satın Alma',
    questions: [
      {
        q: 'Nasıl sipariş veririm?',
        a: 'Beğendiğiniz ürünü seçin, "Satın Al" butonuna tıklayın, teslimat adresinizi girin ve ödeme bilgilerinizi ekleyerek siparişinizi tamamlayın. Sipariş onayı e-posta ile gönderilecektir.',
      },
      {
        q: 'Üye olmadan alışveriş yapabilir miyim?',
        a: 'Evet, misafir olarak sipariş verebilirsiniz. Ancak sipariş geçmişi, favoriler ve satıcıyla mesajlaşma gibi özellikler için üyelik gereklidir.',
      },
      {
        q: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
        a: 'Kredi kartı (Visa, Mastercard, Troy), banka kartı ve iyzico bakiyesi ile ödeme yapabilirsiniz. Tüm ödemeler 3D Secure ile güvence altındadır.',
      },
      {
        q: 'Teklif nasıl gönderirim?',
        a: 'Ürün sayfasında "Teklif Ver" butonuna tıklayarak istediğiniz fiyatı yazın. Satıcı teklifinizi kabul, reddetme veya karşı teklifte bulunabilir.',
      },
    ],
  },
  {
    category: 'Satış',
    questions: [
      {
        q: 'Nasıl ilan veririm?',
        a: '"İlan Ver" butonuna tıklayın; ürün bilgilerini, kategori, durum, fiyat ve fotoğraflarını girerek ilanınızı yayınlayın. İlan onayı genellikle birkaç dakika içinde gerçekleşir.',
      },
      {
        q: 'Komisyon oranları nedir?',
        a: 'Standart üyeler için %5, Premium üyeler için %3, Pro üyeler için %2 komisyon uygulanır. Komisyon yalnızca satış gerçekleştiğinde kesilir.',
      },
      {
        q: 'Ödememi ne zaman alırım?',
        a: 'Alıcı ürünü teslim alıp onayladıktan sonra 3 iş günü içinde tanımlı IBAN hesabınıza transfer edilir.',
      },
      {
        q: 'Kaç ilan verebilirim?',
        a: 'Ücretsiz üyeler aylık 5 ilan verebilir. Premium ve Pro üyeler sınırsız ilan yayınlayabilir.',
      },
    ],
  },
  {
    category: 'Kargo ve Teslimat',
    questions: [
      {
        q: 'Kargo süresi ne kadar?',
        a: 'Satıcı 3 iş günü içinde kargoyu teslim eder. Tahmini teslimat süresi konumunuza göre 2-5 iş günüdür.',
      },
      {
        q: 'Kargo ücretini kim öder?',
        a: 'Kargo ücreti varsayılan olarak alıcıya aittir. Bazı satıcılar ücretsiz kargo seçeneği sunabilir. Ürün sayfasında kargo bilgileri belirtilir.',
      },
      {
        q: 'Siparişimi nasıl takip ederim?',
        a: '"Siparişlerim" sayfasından veya "Sipariş Takip" menüsünden sipariş numaranız ile kargo durumunu görebilirsiniz.',
      },
    ],
  },
  {
    category: 'Takas',
    questions: [
      {
        q: 'Takas nasıl çalışır?',
        a: '"Takas Açık" işaretli ürünlere takas teklifi gönderebilirsiniz. Kendi ürünlerinizden seçim yapın, gerekirse nakit fark ekleyin ve teklif gönderin. Karşılıklı onay ile takas başlar.',
      },
      {
        q: 'Takas güvenli mi?',
        a: 'Evet, Güvenli Takas sistemi ile her iki tarafın ürünleri platform garantisi altında gönderilir. Anlaşmazlık durumunda arabuluculuk yapılır.',
      },
      {
        q: 'Takas ücreti var mı?',
        a: 'Takas işlemi ücretsizdir. Yalnızca kargo ücretleri taraflara aittir. Premium üyeler takas özelliklerine tam erişime sahiptir.',
      },
    ],
  },
  {
    category: 'İade ve İptal',
    questions: [
      {
        q: 'İade süresi ne kadar?',
        a: 'Ürün teslim tarihinden itibaren 14 gün içinde iade talebi oluşturabilirsiniz.',
      },
      {
        q: 'Hasarlı ürün geldi, ne yapmalıyım?',
        a: 'Teslim tarihinden itibaren 3 gün içinde fotoğraflı olarak destek ekibine başvurun. Hasarlı ürün iadeleri satıcı sorumluluğundadır ve tam iade yapılır.',
      },
      {
        q: 'Siparişimi iptal edebilir miyim?',
        a: 'Satıcı kargoya vermeden önce siparişinizi iptal edebilirsiniz. Kargoya verildikten sonra iptal mümkün değildir; iade süreci başlatılması gerekir.',
      },
    ],
  },
  {
    category: 'Hesap ve Üyelik',
    questions: [
      {
        q: 'Premium üyelik avantajları nedir?',
        a: 'Sınırsız ilan, düşük komisyon, takas özelliği, Digital Garage, öncelikli destek ve öne çıkan ilanlar gibi avantajlar sunar.',
      },
      {
        q: 'Şifremi unuttum.',
        a: 'Giriş ekranındaki "Şifremi Unuttum" bağlantısına tıklayarak e-posta adresinize sıfırlama bağlantısı gönderebilirsiniz.',
      },
      {
        q: 'Hesabımı nasıl silerim?',
        a: 'Profil > Ayarlar > Hesap bölümünden "Hesabı Sil" seçeneğini kullanabilirsiniz. Bu işlem kalıcıdır ve geri alınamaz.',
      },
    ],
  },
];

export default function FAQScreen() {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  let globalIndex = -1;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageFaq')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {FAQ_ITEMS.map((section) => (
          <View key={section.category} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.category}</Text>
            {section.questions.map((item) => {
              globalIndex++;
              const idx = globalIndex;
              const isExpanded = expandedIndex === idx;
              return (
                <View key={idx} style={styles.questionCard}>
                  <TouchableOpacity
                    style={styles.questionHeader}
                    onPress={() => setExpandedIndex(isExpanded ? null : idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.questionText}>{item.q}</Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.primary[600]!}
                    />
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.answerContainer}>
                      <Text style={styles.answerText}>{item.a}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Sorunuzun cevabını bulamadınız mı?
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={() => router.push('/support')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
            <Text style={styles.contactButtonText}>Destek Ekibine Yazın</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  questionCard: {
    backgroundColor: colors.surface.alt,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
    marginRight: 12,
  },
  answerContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  answerText: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
    paddingTop: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 12,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});
