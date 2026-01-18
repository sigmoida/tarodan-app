import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Text, Searchbar, List, TextInput, Button, Snackbar, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

const FAQ_CATEGORIES = [
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
        a: 'Ürün açıklamasına uymuyorsa 7 gün içinde iade talep edebilirsiniz. Detaylar için satıcının iade politikasını kontrol edin.'
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
        a: 'Satış gerçekleştiğinde satış tutarı üzerinden %5 komisyon kesilir. Premium üyeler için özel komisyon oranları uygulanabilir.'
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

const CONTACT_OPTIONS = [
  {
    id: 'email',
    title: 'E-posta',
    subtitle: 'destek@tarodan.com',
    icon: 'mail-outline',
    action: () => Linking.openURL('mailto:destek@tarodan.com'),
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    subtitle: '+90 555 123 4567',
    icon: 'logo-whatsapp',
    action: () => Linking.openURL('https://wa.me/905551234567'),
  },
  {
    id: 'phone',
    title: 'Telefon',
    subtitle: '0850 123 4567',
    icon: 'call-outline',
    action: () => Linking.openURL('tel:08501234567'),
  },
];

export default function HelpScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('general');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      setExpandedCategory(null);
    }
  };

  const filteredFAQs = searchQuery.length > 2
    ? FAQ_CATEGORIES.map(cat => ({
        ...cat,
        questions: cat.questions.filter(
          q => q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
               q.a.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.questions.length > 0)
    : FAQ_CATEGORIES;

  const handleSubmitContact = () => {
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setSnackbarMessage('Lütfen tüm alanları doldurun');
      setSnackbarVisible(true);
      return;
    }
    if (!contactEmail.includes('@')) {
      setSnackbarMessage('Geçerli bir e-posta adresi girin');
      setSnackbarVisible(true);
      return;
    }
    
    // Submit contact form (mock)
    setContactName('');
    setContactEmail('');
    setContactMessage('');
    setSnackbarMessage('Mesajınız gönderildi! En kısa sürede dönüş yapacağız.');
    setSnackbarVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yardım Merkezi</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchSection}>
          <Text style={styles.searchTitle}>Nasıl yardımcı olabiliriz?</Text>
          <Searchbar
            placeholder="Soru veya konu ara..."
            value={searchQuery}
            onChangeText={handleSearch}
            style={styles.searchBar}
          />
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity 
            style={styles.quickLink}
            onPress={() => router.push('/order-track')}
          >
            <Ionicons name="location-outline" size={28} color={TarodanColors.primary} />
            <Text style={styles.quickLinkText}>Sipariş Takip</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickLink}
            onPress={() => router.push('/(auth)/login')}
          >
            <Ionicons name="person-outline" size={28} color={TarodanColors.primary} />
            <Text style={styles.quickLinkText}>Giriş Yap</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickLink}
            onPress={() => setExpandedCategory('selling')}
          >
            <Ionicons name="pricetag-outline" size={28} color={TarodanColors.primary} />
            <Text style={styles.quickLinkText}>Satış Yap</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>Sıkça Sorulan Sorular</Text>
          
          {filteredFAQs.map(category => (
            <View key={category.id} style={styles.faqCategory}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => setExpandedCategory(
                  expandedCategory === category.id ? null : category.id
                )}
              >
                <View style={styles.categoryTitle}>
                  <Ionicons 
                    name={category.icon as any} 
                    size={24} 
                    color={TarodanColors.primary} 
                  />
                  <Text style={styles.categoryTitleText}>{category.title}</Text>
                  <View style={styles.questionCount}>
                    <Text style={styles.questionCountText}>{category.questions.length}</Text>
                  </View>
                </View>
                <Ionicons 
                  name={expandedCategory === category.id ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color={TarodanColors.textSecondary} 
                />
              </TouchableOpacity>

              {expandedCategory === category.id && (
                <View style={styles.questionsList}>
                  {category.questions.map((item, index) => (
                    <View key={index} style={styles.questionItem}>
                      <TouchableOpacity
                        style={styles.questionHeader}
                        onPress={() => setExpandedQuestion(
                          expandedQuestion === `${category.id}-${index}` 
                            ? null 
                            : `${category.id}-${index}`
                        )}
                      >
                        <Text style={styles.questionText}>{item.q}</Text>
                        <Ionicons 
                          name={expandedQuestion === `${category.id}-${index}` ? 'remove' : 'add'} 
                          size={20} 
                          color={TarodanColors.primary} 
                        />
                      </TouchableOpacity>
                      {expandedQuestion === `${category.id}-${index}` && (
                        <Text style={styles.answerText}>{item.a}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        <Divider style={styles.divider} />

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>Bize Ulaşın</Text>
          
          <View style={styles.contactOptions}>
            {CONTACT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.id}
                style={styles.contactOption}
                onPress={option.action}
              >
                <View style={styles.contactIcon}>
                  <Ionicons name={option.icon as any} size={24} color={TarodanColors.primary} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactTitle}>{option.title}</Text>
                  <Text style={styles.contactSubtitle}>{option.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Contact Form */}
          <View style={styles.contactForm}>
            <Text style={styles.formTitle}>Mesaj Gönderin</Text>
            <TextInput
              label="Adınız"
              value={contactName}
              onChangeText={setContactName}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="E-posta"
              value={contactEmail}
              onChangeText={setContactEmail}
              mode="outlined"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Mesajınız"
              value={contactMessage}
              onChangeText={setContactMessage}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={4}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={handleSubmitContact}
              style={styles.submitButton}
              icon="send"
            >
              Gönder
            </Button>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Tarodan v1.0.0</Text>
          <View style={styles.appLinks}>
            <TouchableOpacity>
              <Text style={styles.appLink}>Gizlilik Politikası</Text>
            </TouchableOpacity>
            <Text style={styles.appLinkDivider}>•</Text>
            <TouchableOpacity>
              <Text style={styles.appLink}>Kullanım Koşulları</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: snackbarMessage.includes('gönderildi') ? TarodanColors.success : TarodanColors.error }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  content: {
    flex: 1,
  },
  searchSection: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  searchBar: {
    backgroundColor: TarodanColors.background,
    elevation: 0,
    borderRadius: 12,
  },
  quickLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickLink: {
    alignItems: 'center',
  },
  quickLinkText: {
    marginTop: 8,
    fontSize: 12,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  faqSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  faqCategory: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  questionCount: {
    backgroundColor: TarodanColors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  questionCountText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  questionsList: {
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  questionItem: {
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingLeft: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.textPrimary,
    marginRight: 12,
  },
  answerText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
    padding: 16,
    paddingTop: 0,
    paddingLeft: 20,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  divider: {
    marginVertical: 16,
  },
  contactSection: {
    padding: 16,
  },
  contactOptions: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    marginBottom: 16,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  contactSubtitle: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  contactForm: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  submitButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appInfoText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  appLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  appLink: {
    fontSize: 13,
    color: TarodanColors.primary,
  },
  appLinkDivider: {
    marginHorizontal: 8,
    color: TarodanColors.textSecondary,
  },
});
