'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  PencilIcon,
  XMarkIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckIcon,
  DocumentTextIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// ── Sabit sayfalar ─────────────────────────────────────────────────────────

const PREDEFINED_PAGES = [
  {
    slug: 'about',
    title: 'Hakkımızda',
    url: '/about',
    description: 'Platform tanıtımı, vizyon ve misyon.',
  },
  {
    slug: 'faq',
    title: 'Sık Sorulan Sorular',
    url: '/faq',
    description: 'Kullanıcıların en çok sorduğu sorular ve cevaplar.',
  },
  {
    slug: 'privacy',
    title: 'Gizlilik Politikası',
    url: '/privacy',
    description: 'KVKK / GDPR kapsamında kişisel veri işleme politikası.',
  },
  {
    slug: 'terms',
    title: 'Kullanım Koşulları',
    url: '/terms',
    description: 'Platformun kullanım şartları ve hükümleri.',
  },
] as const;

type PredefinedSlug = (typeof PREDEFINED_PAGES)[number]['slug'];

// ── Varsayılan HTML içerikler ──────────────────────────────────────────────

const DEFAULT_CONTENT: Record<PredefinedSlug, { title: string; content: string }> = {
  about: {
    title: 'Hakkımızda',
    content: `<h2>TARODAN Nedir?</h2>
<p>TARODAN, Türkiye'nin diecast model araba koleksiyoncuları için özel olarak tasarlanmış çevrimiçi pazaryeridir. Platformumuz, koleksiyoncuları bir araya getirerek model arabalarını güvenle alıp satmalarını ve takas yapmalarını sağlamaktadır.</p>

<h2>Vizyonumuz</h2>
<p>Türkiye'nin en büyük ve en güvenilir diecast model araba topluluğunu oluşturmak; koleksiyoncuların tutkularını özgürce paylaşabileceği, şeffaf bir platform sunmak.</p>

<h2>Misyonumuz</h2>
<p>Koleksiyoncuların birbirleriyle güvenle buluşabildiği, adil bir pazaryeri sunmak. Her işlemde alıcı ve satıcı haklarını koruyarak diecast topluluğunun büyümesine katkıda bulunmak.</p>

<h2>Değerlerimiz</h2>
<ul>
  <li><strong>Güven:</strong> Her işlem escrow sistemi ile güvence altında.</li>
  <li><strong>Topluluk:</strong> Koleksiyoncuları bir araya getiren canlı bir ekosistem.</li>
  <li><strong>Şeffaflık:</strong> Açık fiyatlandırma ve net komisyon oranları.</li>
  <li><strong>Tutku:</strong> Diecast sevgisini paylaşan bir ekip tarafından yönetiliyoruz.</li>
</ul>

<h2>İletişim</h2>
<p>Sorularınız için <a href="/contact">iletişim sayfamızı</a> ziyaret edebilirsiniz.</p>`,
  },
  faq: {
    title: 'Sık Sorulan Sorular',
    content: `<h2>Genel</h2>

<h3>TARODAN nedir?</h3>
<p>TARODAN, diecast model araba koleksiyoncuları için Türkiye'nin en büyük online pazarıdır. Koleksiyoncular burada model arabalarını alabilir, satabilir ve takas yapabilir.</p>

<h3>TARODAN'a üye olmak ücretsiz mi?</h3>
<p>Evet, üye olmak tamamen ücretsizdir. Ücretsiz üyelikle aylık 5 ilan verebilirsiniz. Daha fazla ilan için Premium veya Business planlarına geçebilirsiniz.</p>

<h3>Hangi marka ve model arabalar satılıyor?</h3>
<p>Hot Wheels, Matchbox, Tomica, Majorette, Maisto, Bburago, Welly ve daha birçok marka diecast model araba bulabilirsiniz. 1:64, 1:43, 1:24, 1:18 gibi farklı ölçeklerde ürünler mevcuttur.</p>

<h2>Satın Alma</h2>

<h3>Nasıl ürün satın alabilirim?</h3>
<p>İstediğiniz ürünü bulun, "Sepete Ekle" veya "Hemen Al" butonuna tıklayın. Ödeme sayfasında adres bilgilerinizi girin ve ödemenizi güvenle tamamlayın.</p>

<h3>Hangi ödeme yöntemleri kabul ediliyor?</h3>
<p>Kredi kartı, banka kartı ve sanal kart ile ödeme yapabilirsiniz. Ödemeler PayTR altyapısı ile güvenle işlenmektedir.</p>

<h3>Ücretsiz kargo var mı?</h3>
<p>Evet! 500 TL ve üzeri alışverişlerde kargo ücretsizdir. Bu tutarın altındaki siparişlerde standart kargo ücreti 29,99 TL'dir.</p>

<h2>Satış Yapma</h2>

<h3>Nasıl ilan verebilirim?</h3>
<p>Üye girişi yaptıktan sonra "İlan Ver" butonuna tıklayın. Ürün fotoğraflarını yükleyin, açıklama yazın, fiyat belirleyin ve ilanınızı yayınlayın.</p>

<h3>Satış komisyonu ne kadar?</h3>
<p>Her başarılı satıştan %8 platform komisyonu alınmaktadır. Premium üyelerde bu oran %6, Business üyelerde %4'e düşmektedir.</p>

<h3>Paramı ne zaman alırım?</h3>
<p>Alıcının ürünü teslim almasının ardından 3 iş günü içinde ödemeniz hesabınıza aktarılır.</p>

<h2>Takas</h2>

<h3>Takas nasıl çalışıyor?</h3>
<p>Takasa açık ürünlerde "Takas Teklifi" butonu görünür. Kendi ürünlerinizden birini seçerek takas teklifi gönderebilirsiniz. Satıcı kabul ederse takas gerçekleşir.</p>

<h3>Takas için komisyon var mı?</h3>
<p>Takas işlemlerinde platform komisyonu alınmaz. Sadece kargo masrafları taraflara aittir.</p>

<h2>Kargo ve Teslimat</h2>

<h3>Hangi kargo firmasıyla çalışıyorsunuz?</h3>
<p>Sürat Kargo ile çalışıyoruz. Siparişiniz 1-3 iş günü içinde kargoya verilir ve ortalama 2-4 iş günü içinde teslim edilir.</p>

<h3>Ürün hasarlı gelirse ne yapmalıyım?</h3>
<p>Teslimat sırasında kargo görevlisi yanındayken paketi kontrol edin. Hasar varsa tutanak tutturun ve 24 saat içinde bizimle iletişime geçin.</p>

<h2>Hesap ve Güvenlik</h2>

<h3>Şifremi unuttum, ne yapmalıyım?</h3>
<p>Giriş sayfasında "Şifremi Unuttum" bağlantısına tıklayın. E-posta adresinize şifre sıfırlama linki gönderilecektir.</p>

<h3>Kişisel bilgilerim güvende mi?</h3>
<p>Evet, tüm kişisel verileriniz şifrelenmiş şekilde saklanır. KVKK ve GDPR uyumlu çalışıyoruz. Detaylar için <a href="/privacy">Gizlilik Politikamızı</a> inceleyebilirsiniz.</p>`,
  },
  privacy: {
    title: 'Gizlilik Politikası',
    content: `<p><em>Son güncelleme: Ocak 2026</em></p>

<h2>1. Giriş</h2>
<p>TARODAN olarak kişisel verilerinizin korunmasına büyük önem veriyoruz. Bu Gizlilik Politikası, kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklamaktadır. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve Avrupa Birliği Genel Veri Koruma Tüzüğü (GDPR) kapsamında haklarınızı bu politikada bulabilirsiniz.</p>

<h2>2. Toplanan Veriler</h2>
<p>Platformumuzu kullandığınızda aşağıdaki kişisel veriler toplanmaktadır:</p>
<ul>
  <li>Ad, soyad ve e-posta adresi</li>
  <li>Telefon numarası ve teslimat adresi</li>
  <li>Ödeme bilgileri (kart numarası tarafımızca saklanmaz; ödeme altyapı sağlayıcısı üzerinden işlenir)</li>
  <li>İşlem, sipariş ve mesaj geçmişi</li>
  <li>Kullanım verileri, IP adresi ve çerezler</li>
</ul>

<h2>3. Verilerin Kullanım Amacı</h2>
<p>Topladığımız veriler aşağıdaki amaçlarla kullanılmaktadır:</p>
<ul>
  <li>Hizmetlerimizin sağlanması ve iyileştirilmesi</li>
  <li>Sipariş, ödeme ve kargo işlemlerinin tamamlanması</li>
  <li>Müşteri desteği ve iletişimin sağlanması</li>
  <li>Dolandırıcılık önleme ve platform güvenliği</li>
  <li>Yasal yükümlülüklerin yerine getirilmesi</li>
</ul>

<h2>4. Veri Paylaşımı</h2>
<p>Kişisel verileriniz; ödeme işlemcileri, kargo firmaları ve bulut hizmet sağlayıcıları gibi hizmet sunumu için zorunlu üçüncü taraflarla paylaşılabilir. Verileriniz hiçbir koşulda reklam amaçlı üçüncü taraflara satılmaz.</p>

<h2>5. Veri Güvenliği</h2>
<p>Kişisel verileriniz SSL şifrelemesi, güvenlik duvarları ve düzenli güvenlik denetimleriyle korunmaktadır. Veri ihlali durumunda yasal süreler içinde bilgilendirilirsiniz.</p>

<h2>6. Çerezler</h2>
<p>Platformumuz oturum, tercih ve analitik amaçlı çerezler kullanmaktadır. Çerez tercihlerinizi tarayıcı ayarlarınızdan yönetebilirsiniz.</p>

<h2>7. KVKK Kapsamındaki Haklarınız</h2>
<p>6698 sayılı Kanun kapsamında aşağıdaki haklara sahipsiniz:</p>
<ul>
  <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
  <li>İşlenen veriler hakkında bilgi talep etme</li>
  <li>Verilerin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
  <li>Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri öğrenme</li>
  <li>Eksik veya yanlış işlenen verilerin düzeltilmesini isteme</li>
  <li>Kişisel verilerin silinmesini veya yok edilmesini isteme</li>
  <li>İşleme itiraz etme ve zararın giderilmesini talep etme</li>
</ul>

<h2>8. İletişim</h2>
<p>Gizlilik politikamız veya kişisel verilerinizle ilgili sorularınız için <a href="/contact">iletişim sayfamız</a> üzerinden bize ulaşabilirsiniz.</p>`,
  },
  terms: {
    title: 'Kullanım Koşulları',
    content: `<p><em>Son güncelleme: Ocak 2026</em></p>

<h2>1. Kabul</h2>
<p>TARODAN platformunu kullanarak bu Kullanım Koşullarını okuduğunuzu ve kabul ettiğinizi beyan edersiniz. Koşulları kabul etmiyorsanız platformu kullanmayınız.</p>

<h2>2. Üyelik Şartları</h2>
<p>Platforma üye olmak için 18 yaşını doldurmuş olmanız gerekmektedir. Üyelik bilgilerinizin doğru, eksiksiz ve güncel olmasından siz sorumlusunuz. Hesap güvenliğinizi sağlamak ve yetkisiz erişimleri önlemek sizin sorumluluğunuzdadır.</p>

<h2>3. İlan Kuralları</h2>
<ul>
  <li>Yalnızca gerçek ve sahip olduğunuz ürünleri listeleyebilirsiniz.</li>
  <li>Ürün açıklamaları eksiksiz, doğru ve yanıltıcı olmayan bilgiler içermelidir.</li>
  <li>Fotoğraflar gerçek ürünü yansıtmalı; başkalarına ait görseller kullanılamaz.</li>
  <li>Yasal olmayan ürünlerin satışı kesinlikle yasaktır.</li>
  <li>Aynı ürün için birden fazla ilan açmak yasaktır.</li>
</ul>

<h2>4. Ödeme ve Komisyon</h2>
<p>Başarılı satışlardan platform komisyonu alınmaktadır. Komisyon oranları üyelik planınıza göre değişmektedir (Ücretsiz: %8, Premium: %6, Business: %4). Ödemeler güvenli escrow sistemi aracılığıyla işlenmekte; alıcının teslim onayının ardından satıcıya aktarılmaktadır.</p>

<h2>5. İade ve İptal Politikası</h2>
<p>Alıcılar, teslimatından itibaren 14 gün içinde iade talebinde bulunabilir. Ürün, açıklamaya uygun ve kullanılmamış olmalıdır. Kargo hasarına bağlı iadelerde tutanak şartı aranır. Takas işlemlerinde iade koşulları karşılıklı anlaşmaya bağlıdır.</p>

<h2>6. Yasaklı Davranışlar</h2>
<ul>
  <li>Dolandırıcılık, sahtecilik veya yanıltıcı işlemler</li>
  <li>Platform dışı ödeme talep etme veya kabul etme</li>
  <li>Sahte yorum, değerlendirme veya şikâyet oluşturma</li>
  <li>Diğer kullanıcılara spam veya istenmeyen mesaj gönderme</li>
  <li>Platformun teknik altyapısına zarar verme girişimleri</li>
  <li>Başka kullanıcıların hesap bilgilerine erişim sağlamaya çalışma</li>
</ul>

<h2>7. Fikri Mülkiyet</h2>
<p>TARODAN markası, logosu, tasarımı ve içerikleri şirkete aittir. Kullanıcılar, platform üzerinde paylaştıkları içerikler için gerekli haklara sahip olduklarını beyan eder.</p>

<h2>8. Hesap Askıya Alma ve Kapatma</h2>
<p>Bu koşulları ihlal eden hesaplar, uyarı yapılmaksızın askıya alınabilir veya kalıcı olarak kapatılabilir. TARODAN, kendi takdirine bağlı olarak herhangi bir hesabı sonlandırma hakkını saklı tutar.</p>

<h2>9. Sorumluluk Sınırlaması</h2>
<p>TARODAN, kullanıcılar arasındaki işlemlerin tarafı değildir. Platform, üçüncü tarafların eylemlerinden doğan zararlardan sorumlu tutulamaz. Platform, teknik arızalar nedeniyle oluşabilecek kesintilerden dolayı tazminat yükümlülüğü kabul etmez.</p>

<h2>10. Değişiklikler</h2>
<p>TARODAN, bu koşulları önceden bildirmeksizin değiştirme hakkını saklı tutar. Değişiklikler yayınlandığı tarihten itibaren geçerli olur. Platformu kullanmaya devam etmeniz değişiklikleri kabul ettiğiniz anlamına gelir.</p>

<h2>11. İletişim</h2>
<p>Bu koşullar hakkında sorularınız için <a href="/contact">iletişim sayfamızı</a> ziyaret edin.</p>`,
  },
};

// ── Tipler ────────────────────────────────────────────────────────────────

interface StaticPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  isPublished: boolean;
  sortOrder: number;
}

interface EditorForm {
  title: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  isPublished: boolean;
}

// ── Önizleme iframe HTML'i ────────────────────────────────────────────────

function buildPreviewDoc(html: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px 32px; color: #1a1a1a; background: #fff; line-height: 1.65; font-size: 15px; }
  h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.5em; }
  h2 { font-size: 1.25rem; font-weight: 700; margin: 1.75em 0 0.5em; color: #111; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.35em; }
  h3 { font-size: 1.05rem; font-weight: 600; margin: 1.25em 0 0.35em; color: #222; }
  p { margin: 0 0 1em; color: #374151; }
  ul, ol { padding-left: 1.5em; margin: 0 0 1em; }
  li { margin-bottom: 0.35em; color: #374151; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 600; }
  em { font-style: italic; color: #6b7280; }
  code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.875em; font-family: monospace; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0 0 1em; padding: 0.5em 1em; color: #6b7280; }
  img { max-width: 100%; border-radius: 8px; }
</style>
</head>
<body>${html || '<p style="color:#9ca3af;font-style:italic;">İçerik henüz girilmedi.</p>'}</body>
</html>`;
}

// ── Ana Bileşen ────────────────────────────────────────────────────────────

export default function AdminPagesPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [editSlug, setEditSlug] = useState<PredefinedSlug | null>(null);
  const [form, setForm] = useState<EditorForm>({ title: '', content: '', metaTitle: '', metaDescription: '', metaKeywords: '', isPublished: true });
  const [seoOpen, setSeoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Veri ──────────────────────────────────────────────────────────────────

  const { data: pageMap = {}, isLoading } = useQuery<Record<string, StaticPage>>({
    queryKey: ['admin', 'pages'],
    queryFn: async () => {
      const res = await adminApi.getPages();
      const pages: StaticPage[] = res.data?.data ?? [];
      return Object.fromEntries(pages.map((p) => [p.slug, p]));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });

  // ── Editör ────────────────────────────────────────────────────────────────

  const openEditor = async (slug: PredefinedSlug) => {
    const existing = pageMap[slug];
    let initialForm: EditorForm;
    if (existing) {
      try {
        const res = await adminApi.getPageById(existing.id);
        const p: StaticPage = res.data;
        initialForm = {
          title: p.title,
          content: p.content ?? '',
          metaTitle: p.metaTitle ?? '',
          metaDescription: p.metaDescription ?? '',
          metaKeywords: p.metaKeywords ?? '',
          isPublished: p.isPublished,
        };
      } catch {
        toast.error('Sayfa yüklenemedi');
        return;
      }
    } else {
      const def = DEFAULT_CONTENT[slug];
      initialForm = { title: def.title, content: def.content, metaTitle: '', metaDescription: '', metaKeywords: '', isPublished: true };
    }
    setForm(initialForm);
    setPreviewHtml(buildPreviewDoc(initialForm.content));
    setSeoOpen(false);
    setEditSlug(slug);
  };

  const closeEditor = () => {
    clearTimeout(debounceRef.current);
    setEditSlug(null);
  };

  const handleContentChange = (value: string) => {
    setForm((f) => ({ ...f, content: value }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(buildPreviewDoc(value));
    }, 600);
  };

  const handleTabKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
    handleContentChange(next);
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!editSlug) return;
    setSaving(true);
    try {
      const existing = pageMap[editSlug];
      if (existing) {
        await adminApi.updatePage(existing.id, form);
      } else {
        await adminApi.createPage({ slug: editSlug, ...form });
      }
      toast.success('Sayfa kaydedildi');
      invalidate();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!editSlug) return;
    const meta = PREDEFINED_PAGES.find((p) => p.slug === editSlug)!;
    const ok = await confirm({
      title: 'Varsayılana Sıfırla',
      description: `"${meta.title}" sayfasının içeriği varsayılan metinle değiştirilecek. Mevcut içerik kaybolacak. Emin misiniz?`,
      confirmLabel: 'Sıfırla',
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      const def = DEFAULT_CONTENT[editSlug];
      const next: EditorForm = { ...form, title: def.title, content: def.content };
      setForm(next);
      setPreviewHtml(buildPreviewDoc(def.content));
      toast.success('Varsayılan içerik yüklendi — kaydetmek için "Kaydet" butonuna tıklayın');
    } finally {
      setResetting(false);
    }
  };

  // ── Metadata ──────────────────────────────────────────────────────────────

  const editMeta = editSlug ? PREDEFINED_PAGES.find((p) => p.slug === editSlug) : null;
  const isEditing = editSlug ? !!pageMap[editSlug] : false;

  // ── Liste ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Liste görünümü */}
      {!editSlug && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-heading">Sayfa Yönetimi</h1>
            <p className="text-muted mt-1 text-sm">
              Web sitesinin sabit sayfalarının içeriğini düzenleyin.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted text-sm">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PREDEFINED_PAGES.map((page) => {
                const existing = pageMap[page.slug];
                return (
                  <div
                    key={page.slug}
                    className="bg-surface-elevated border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary-400 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <DocumentTextIcon className="h-5 w-5 text-primary-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold text-heading">{page.title}</h2>
                          {existing ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              existing.isPublished
                                ? 'bg-success-500/10 text-success-600'
                                : 'bg-surface-alt text-muted'
                            }`}>
                              <GlobeAltIcon className="h-3 w-3" />
                              {existing.isPublished ? 'Yayında' : 'Taslak'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-warning-500/10 text-warning-600">
                              <ExclamationTriangleIcon className="h-3 w-3" />
                              İçerik yok
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{page.description}</p>
                        <p className="text-xs font-mono text-subtle mt-1">{page.url}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditor(page.slug)}
                      className="inline-flex items-center gap-1.5 text-sm mt-auto px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      {existing ? 'Düzenle' : 'İçerik Oluştur'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tam ekran editör */}
      {editSlug && editMeta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-heading/70 backdrop-blur-sm">
          <div
            className="m-3 flex flex-col bg-surface-elevated rounded-xl border border-border shadow-2xl overflow-hidden"
            style={{ height: 'calc(100vh - 1.5rem)' }}
          >
            {/* Başlık çubuğu */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-elevated shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <DocumentTextIcon className="h-5 w-5 text-primary-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-heading truncate">{editMeta.title}</h2>
                  <p className="text-xs text-muted font-mono">{editMeta.url}</p>
                </div>
                {isEditing && pageMap[editSlug]?.isPublished && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-success-600 bg-success-500/10 px-2 py-0.5 rounded-full">
                    <GlobeAltIcon className="h-3 w-3" />
                    Yayında
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="shrink-0 p-1.5 text-muted hover:text-heading hover:bg-surface-alt rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Gövde — split panel */}
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* SOL: Editör */}
              <div className="flex flex-col w-1/2 border-r border-border overflow-y-auto min-w-0">
                <div className="p-4 space-y-4 flex-1 flex flex-col">

                  {/* Sayfa başlığı */}
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Sayfa Başlığı</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading placeholder-muted outline-none focus:ring-2 focus:ring-primary-500/40"
                      placeholder="Başlık"
                    />
                  </div>

                  {/* HTML Editör */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-muted">HTML İçerik</label>
                      <span className="text-xs text-muted/50">
                        {form.content.length > 0 ? `${form.content.length} karakter` : 'Boş'}
                      </span>
                    </div>
                    <div className="flex-1 relative rounded-lg border border-border overflow-hidden" style={{ minHeight: '340px' }}>
                      <textarea
                        id="html-editor"
                        value={form.content}
                        onChange={(e) => handleContentChange(e.target.value)}
                        onKeyDown={handleTabKey}
                        className="absolute inset-0 w-full h-full resize-none font-mono text-xs leading-relaxed p-3 bg-gray-950 text-gray-100 outline-none focus:ring-1 focus:ring-primary-500/50"
                        placeholder={`HTML içerik yazın.\nÖrnek:\n<h2>Başlık</h2>\n<p>Paragraf metni.</p>\n<ul>\n  <li>Madde 1</li>\n  <li>Madde 2</li>\n</ul>`}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                    </div>
                    <p className="text-xs text-muted/60 mt-1">
                      Desteklenen etiketler: h1–h4, p, strong, em, a, ul, ol, li, blockquote, code
                    </p>
                  </div>

                  {/* SEO — daraltılabilir */}
                  <div className="border border-border rounded-lg overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setSeoOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted hover:bg-surface-alt transition-colors"
                    >
                      <span>SEO Ayarları</span>
                      <ChevronDownIcon className={`h-4 w-4 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {seoOpen && (
                      <div className="p-3 space-y-3 border-t border-border">
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">Meta Başlık</label>
                          <input
                            type="text"
                            value={form.metaTitle}
                            onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
                            placeholder="Tarayıcı sekme başlığı"
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading placeholder-muted outline-none focus:ring-2 focus:ring-primary-500/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">Meta Açıklama</label>
                          <textarea
                            value={form.metaDescription}
                            onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                            placeholder="Arama sonuçlarında görünen açıklama (150-160 karakter)"
                            rows={2}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading placeholder-muted outline-none resize-none focus:ring-2 focus:ring-primary-500/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">Anahtar Kelimeler</label>
                          <input
                            type="text"
                            value={form.metaKeywords}
                            onChange={(e) => setForm((f) => ({ ...f, metaKeywords: e.target.value }))}
                            placeholder="kelime1, kelime2, kelime3"
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading placeholder-muted outline-none focus:ring-2 focus:ring-primary-500/40"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Yayın durumu + Butonlar */}
                  <div className="flex flex-col gap-3 pt-2 border-t border-border shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.isPublished}
                        onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                        className="h-4 w-4 rounded border-border text-primary-600 accent-primary-600"
                      />
                      <span className="text-sm text-heading">Yayında — web sitesinde görünür</span>
                    </label>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        {saving ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckIcon className="h-4 w-4" />
                        )}
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={resetting}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-danger-500 hover:bg-danger-500/10 border border-danger-500/30 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {resetting ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowPathIcon className="h-4 w-4" />
                        )}
                        Varsayılana sıfırla
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SAĞ: Önizleme */}
              <div className="flex flex-col w-1/2 bg-surface-alt/20 min-w-0">
                <div className="px-4 py-2.5 border-b border-border bg-surface-elevated shrink-0 flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">Önizleme</span>
                  <span className="text-xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">Canlı</span>
                </div>
                <iframe
                  srcDoc={previewHtml}
                  className="flex-1 w-full border-0 bg-white"
                  title="Sayfa önizlemesi"
                  sandbox="allow-same-origin"
                />
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
