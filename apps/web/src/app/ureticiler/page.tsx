'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { manufacturersApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, ChevronRightIcon, GlobeAltIcon, CalendarIcon, SparklesIcon } from '@heroicons/react/24/outline';import { Button, Input } from '@tarodan/ui';


interface BrandData {
  name: string;
  logoUrl: string;
  country: string;
  countryFlag: string;
  founded: number;
  parent: string;
  scale: string;
  description: string;
  history: string;
  specialty: string;
  popularModels: string[];
  productCount: number;
  slug: string;
}

const BRANDS_DATA: BrandData[] = [
  {
    name: 'Hot Wheels',
    logoUrl: '/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg',
    country: 'USA',
    countryFlag: '🇺🇸',
    founded: 1968,
    parent: 'Mattel',
    scale: '1:64',
    description: 'Dünyanın en popüler diecast marka. Koleksiyonerlerin ve çocukların vazgeçilmezi.',
    history: 'Elliot Handler tarafından 1968\'de kurulan Hot Wheels, yarış performansına odaklanan ilk oyuncak araba markasıdır. İlk yılında 16 model ile başlayan marka, bugün milyarlarca araba üretti.',
    specialty: 'Fantasy & Licensed araçlar, Treasure Hunts, Super Treasure Hunts',
    popularModels: ['Nissan Skyline GT-R', 'Twin Mill', '\'67 Camaro', 'Bone Shaker', 'Toyota AE86'],
    productCount: 342,
    slug: 'hot-wheels',
  },
  {
    name: 'Matchbox',
    logoUrl: '/photos/logolar/images.png',
    country: 'UK',
    countryFlag: '🇬🇧',
    founded: 1953,
    parent: 'Mattel',
    scale: '1:64',
    description: 'Gerçekçi diecast modellerin öncüsü. 70 yılı aşkın tarihi ile efsane marka.',
    history: 'Jack Odell, 1953\'te kızının okuluna kibrit kutusu boyutunda bir araba yaparak Matchbox\'ı doğurdu. Gerçekçi tasarıma odaklanan marka, diecast endüstrisinin temel taşlarından biri oldu.',
    specialty: 'Gerçekçi replika modeller, sürdürülebilirlik serisi',
    popularModels: ['Land Rover Defender', 'Volkswagen Beetle', 'Ford Mustang', 'Tesla Roadster'],
    productCount: 156,
    slug: 'matchbox',
  },
  {
    name: 'Tamiya',
    logoUrl: '/photos/logolar/tamiya-logo-png_seeklogo-324507.png',
    country: 'Japan',
    countryFlag: '🇯🇵',
    founded: 1946,
    parent: 'Tamiya Inc.',
    scale: '1:24',
    description: 'Plastik model kit ve RC araç dünyasının lider markası.',
    history: 'Shunsaku Tamiya tarafından 1946\'da ahşap iş olarak başlayan şirket, 1960\'larda plastik model kitler ile dünya çapında tanındı. Detay ve kalite standartlarını belirleyen marka olarak bilinir.',
    specialty: 'Plastik model kitler, RC arabalar, detay boyama',
    popularModels: ['Toyota Supra', 'Porsche 911 GT3', 'Nissan GT-R Nismo', 'Ferrari F40'],
    productCount: 89,
    slug: 'tamiya',
  },
  {
    name: 'AUTOart',
    logoUrl: '/photos/logolar/download.png',
    country: 'Hong Kong',
    countryFlag: '🇭🇰',
    founded: 1998,
    parent: 'Creative Master International',
    scale: '1:18',
    description: 'Ultra premium diecast modellerin zirvesi. Her detay mükemmel.',
    history: 'AUTOart 1998\'de koleksiyoner kalitesinde diecast modeller üretmek amacıyla kuruldu. Açılan kapılar, gerçekçi motor detayları ve composite body teknolojisi ile premium segmentin lideri oldu.',
    specialty: 'Composite body, açılan tüm parçalar, motor detayı',
    popularModels: ['Koenigsegg Agera RS', 'Lamborghini Aventador', 'Porsche 911 GT2 RS', 'McLaren P1'],
    productCount: 124,
    slug: 'autoart',
  },
  {
    name: 'Kyosho',
    logoUrl: '/photos/logolar/Kyosho_corp_logo.png',
    country: 'Japan',
    countryFlag: '🇯🇵',
    founded: 1963,
    parent: 'Kyosho Corporation',
    scale: '1:18',
    description: 'Japon hassasiyeti ile üretilen premium diecast modeller.',
    history: 'Kyosho, RC araç teknolojisinden diecast dünyasına geçerek yüksek kaliteli ölçek modeller üretmeye başladı. Özellikle Japon araçlarındaki detay kalitesi ile tanınır.',
    specialty: 'Japon araçlar, SAMURAI serisi, Jikkensha serisi',
    popularModels: ['Nissan Skyline GT-R', 'Toyota 2000GT', 'Mazda Cosmo', 'Honda NSX'],
    productCount: 78,
    slug: 'kyosho',
  },
  {
    name: 'Maisto',
    logoUrl: '/photos/logolar/maisto-logo.png',
    country: 'Thailand',
    countryFlag: '🇹🇭',
    founded: 1990,
    parent: 'May Cheong Group',
    scale: '1:18',
    description: 'Uygun fiyatlı premium kalite. Koleksiyona başlamak için ideal.',
    history: 'May Cheong Group\'un premium markası olarak 1990\'da kurulan Maisto, kalite ve fiyat dengesinde sektörün en iyileri arasına girdi. Special Edition ve Premiere serileri ile geniş bir koleksiyoner kitlesine ulaşır.',
    specialty: 'Geniş araç yelpazesi, uygun fiyat, Special Edition serisi',
    popularModels: ['Bugatti Chiron', 'Ferrari LaFerrari', 'Lamborghini Centenario', 'Mercedes-AMG GT'],
    productCount: 201,
    slug: 'maisto',
  },
  {
    name: 'Bburago',
    logoUrl: '/photos/logolar/Bburago_Logo.png',
    country: 'Italy',
    countryFlag: '🇮🇹',
    founded: 1974,
    parent: 'Maisto (May Cheong)',
    scale: '1:18',
    description: 'İtalyan tasarım geleneği ile üretilen diecast klasik.',
    history: 'İtalya\'nın Burago di Molgora kasabasında 1974\'te kurulan Bburago, özellikle Ferrari, Lamborghini gibi İtalyan süper araçların modellerinde uzmanlaştı. 2005\'te Maisto tarafından satın alındı.',
    specialty: 'Ferrari lisanslı modeller, İtalyan süper arabalar',
    popularModels: ['Ferrari 488 GTB', 'Lamborghini Huracán', 'Alfa Romeo Giulia', 'Porsche 911'],
    productCount: 167,
    slug: 'bburago',
  },
  {
    name: 'Greenlight',
    logoUrl: '/photos/logolar/Greenlight_collectibles_logo.png',
    country: 'USA',
    countryFlag: '🇺🇸',
    founded: 2002,
    parent: 'Greenlight Collectibles',
    scale: '1:64',
    description: 'Film ve TV araçlarının efsane üreticisi. Koleksiyoner odaklı.',
    history: 'Greenlight, film ve televizyon araçlarını lisanslı olarak üreten öncü marka. Hollywood, Hobby Exclusive ve Green Machine chase modelleri ile koleksiyonerlerin gözdesi.',
    specialty: 'Film/TV araçları, Green Machine chase, Hollywood serisi',
    popularModels: ['Supernatural Impala', 'Gone in 60 Seconds Eleanor', 'Breaking Bad RV', 'John Wick Mustang'],
    productCount: 245,
    slug: 'greenlight',
  },
  {
    name: 'Minichamps',
    logoUrl: '/photos/logolar/minichamps_logo.png',
    country: 'Germany',
    countryFlag: '🇩🇪',
    founded: 1990,
    parent: 'Paul\'s Model Art',
    scale: '1:43',
    description: 'Alman mühendislik hassasiyeti ile üretilen yarış modelleri.',
    history: 'Paul Lang tarafından 1990\'da kurulan Minichamps, özellikle Formula 1 ve DTM yarış araçlarının detaylı replikaları ile tanınır. 1:43 ölçekte dünyanın en büyük üreticisidir.',
    specialty: 'F1 araçlar, DTM, Le Mans serisi, limited edition',
    popularModels: ['Mercedes-AMG F1 W11', 'Porsche 917K', 'BMW M3 E30', 'Audi Quattro'],
    productCount: 312,
    slug: 'minichamps',
  },
  {
    name: 'MINI GT',
    logoUrl: '/photos/logolar/mini-gt-logo-png_seeklogo-523421.png',
    country: 'Hong Kong',
    countryFlag: '🇭🇰',
    founded: 2018,
    parent: 'True Scale Miniatures',
    scale: '1:64',
    description: '1:64 ölçeğin yeni standardı. Detay ve kalitede devrim.',
    history: 'TSM\'nin 1:64 markası olarak 2018\'de kurulan MINI GT, kısa sürede koleksiyonerlerin en çok tercih ettiği 1:64 premium marka haline geldi. Gerçekçi boya, detaylı jantlar ve geniş model yelpazesi ile öne çıkar.',
    specialty: 'Premium 1:64, detaylı jantlar, geniş lisans portföyü',
    popularModels: ['Lamborghini Huracán STO', 'Porsche 911 GT3', 'Nissan GT-R R35', 'BMW M4 CSL'],
    productCount: 456,
    slug: 'mini-gt',
  },
  {
    name: 'Tomica',
    logoUrl: '/photos/logolar/Tomica_brand_textlogo.png',
    country: 'Japan',
    countryFlag: '🇯🇵',
    founded: 1970,
    parent: 'Takara Tomy',
    scale: '1:64',
    description: 'Japonya\'nın efsanevi diecast markası. 50+ yıllık gelenek.',
    history: 'Takara Tomy tarafından 1970\'te kurulan Tomica, Japon araç pazarına odaklanan küçük ölçekli diecast modelleri ile bilinir. Premium ve Limited Vintage serileri koleksiyonerlerin gözdesidir.',
    specialty: 'Japon araçlar, Premium serisi, Limited Vintage Neo',
    popularModels: ['Toyota AE86 Sprinter', 'Nissan Fairlady Z', 'Honda Civic Type R', 'Suzuki Jimny'],
    productCount: 198,
    slug: 'tomica',
  },
  {
    name: 'Majorette',
    logoUrl: '/photos/logolar/majorette-logo-png_seeklogo-492958.png',
    country: 'France',
    countryFlag: '🇫🇷',
    founded: 1961,
    parent: 'Simba Dickie Group',
    scale: '1:64',
    description: 'Fransız diecast geleneği. Avrupa araçlarında uzman.',
    history: 'Fransa\'da 1961\'de kurulan Majorette, özellikle Avrupa araç markalarının detaylı 1:64 replikaları ile tanınır. Premium Cars ve Limited Edition serileri ile kalitesini sürekli artırmaktadır.',
    specialty: 'Premium Cars, Avrupa araçları, Deluxe serisi',
    popularModels: ['Porsche 911 Carrera S', 'Mercedes-AMG GT', 'Renault Megane RS', 'Volkswagen Golf GTI'],
    productCount: 134,
    slug: 'majorette',
  },
  {
    name: 'GT Spirit',
    logoUrl: '/photos/logolar/GT-Spirit-Logo.webp',
    country: 'France',
    countryFlag: '🇫🇷',
    founded: 2012,
    parent: 'Ottomobile',
    scale: '1:18',
    description: 'Resin model dünyasının yükselen yıldızı.',
    history: 'Ottomobile\'in kardeş markası olarak 2012\'de kurulan GT Spirit, sealed resin body modelleri ile tanınır. Özellikle modern süper araçlar ve tuning araçlarında geniş ürün yelpazesi sunar.',
    specialty: 'Resin modeller, modern süper arabalar, tuning versiyonlar',
    popularModels: ['Nissan GT-R R35 Nismo', 'Porsche 911 Turbo S', 'Audi RS6 Avant', 'BMW M3 Competition'],
    productCount: 89,
    slug: 'gt-spirit',
  },
  {
    name: 'CMC',
    logoUrl: '/photos/logolar/cmc_logo-640x320.jpg',
    country: 'Germany',
    countryFlag: '🇩🇪',
    founded: 1995,
    parent: 'Classic Model Cars',
    scale: '1:18',
    description: 'Diecast sanatının zirvesi. Müze kalitesinde modeller.',
    history: 'Alman mühendislik mükemmelliğinin diecast\'e yansıması olan CMC, her modeli binlerce parçadan elle monte eder. Mercedes-Benz Silver Arrow\'dan Ferrari 250 GTO\'ya kadar klasik yarış araçlarının en detaylı replikalarını üretir.',
    specialty: 'Elle montaj, 2000+ parça, klasik yarış araçları',
    popularModels: ['Mercedes-Benz W196', 'Ferrari 250 GTO', 'Auto Union Type C', 'Maserati 300S'],
    productCount: 45,
    slug: 'cmc',
  },
  {
    name: 'Norev',
    logoUrl: '/photos/logolar/5bc0b46797d85-thumbnail.jpg',
    country: 'France',
    countryFlag: '🇫🇷',
    founded: 1946,
    parent: 'Norev SAS',
    scale: '1:18',
    description: 'Fransız otomobil mirasının sadık koruyucusu.',
    history: 'Joseph Véron tarafından 1946\'da kurulan Norev, başlangıçta Fransız araçlara odaklandı. Bugün tüm büyük Avrupa markalarının lisanslı modellerini üretir ve 1:18 ölçekte kalite/fiyat dengesinin en iyisi kabul edilir.',
    specialty: 'Fransız araçlar, dealer edition, uygun fiyatlı 1:18',
    popularModels: ['Peugeot 205 GTI', 'Renault Alpine A110', 'Mercedes-Benz S-Class', 'Citroën DS'],
    productCount: 178,
    slug: 'norev',
  },
  {
    name: 'Schuco',
    logoUrl: '/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg',
    country: 'Germany',
    countryFlag: '🇩🇪',
    founded: 1912,
    parent: 'Simba Dickie Group',
    scale: '1:43',
    description: '110 yılı aşan Alman diecast geleneği.',
    history: 'Heinrich Müller tarafından 1912\'de Nürnberg\'de kurulan Schuco, dünyanın en eski oyuncak ve model araba markalarından biridir. Alman araçlarının detaylı modellerini üretmeye devam etmektedir.',
    specialty: 'Klasik Alman araçlar, Volkswagen, Porsche serileri',
    popularModels: ['Volkswagen T1 Bus', 'Porsche 356', 'BMW Isetta', 'Mercedes-Benz 300 SL'],
    productCount: 92,
    slug: 'schuco',
  },
];

const SCALE_GROUPS = [
  { scale: '1:18', label: 'Premium Ölçek', desc: 'Vitrin ve sergi için ideal büyük modeller' },
  { scale: '1:43', label: 'Koleksiyoner Ölçeği', desc: 'Detay ve boyut dengesi' },
  { scale: '1:64', label: 'Popüler Ölçek', desc: 'En çok toplanan, uygun fiyatlı modeller' },
  { scale: '1:24', label: 'Model Kit Ölçeği', desc: 'Kendin yap setleri için standart' },
];

export default function UreticilerPage() {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScale, setSelectedScale] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const { data: apiManufacturersRaw } = useQuery({
    queryKey: ['manufacturers-list'],
    queryFn: async () => {
      const res = await manufacturersApi.findAll();
      const raw = res.data;
      return Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
    },
    staleTime: 60_000,
  });

  const apiManufacturers = Array.isArray(apiManufacturersRaw) ? apiManufacturersRaw : [];

  const brandsForPage = useMemo(() => {
    return apiManufacturers.map((m: any) => {
      const fromData = BRANDS_DATA.find(
        (b) => b.slug === m.slug || b.name.toLowerCase() === (m.name || '').toLowerCase()
      );
      const productCount = m._count?.products ?? 0;
      return {
        name: m.name,
        slug: m.slug,
        logoUrl: m.logo || fromData?.logoUrl || '',
        country: m.country || fromData?.country || '',
        countryFlag: fromData?.countryFlag ?? '🌐',
        founded: fromData?.founded ?? 0,
        parent: fromData?.parent ?? '',
        scale: fromData?.scale ?? '',
        description: m.description || fromData?.description || '',
        history: fromData?.history ?? '',
        specialty: fromData?.specialty ?? '',
        popularModels: fromData?.popularModels ?? [],
        productCount,
      };
    });
  }, [apiManufacturers]);

  const filteredBrands = useMemo(() => {
    return brandsForPage.filter((b) => {
      const matchesSearch =
        !searchQuery ||
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.country || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesScale = !selectedScale || b.scale === selectedScale;
      const matchesCountry = !selectedCountry || b.country === selectedCountry;
      return matchesSearch && matchesScale && matchesCountry;
    });
  }, [brandsForPage, searchQuery, selectedScale, selectedCountry]);

  const countries = useMemo(() => {
    const map = new Map<string, { flag: string; count: number }>();
    brandsForPage.forEach((b) => {
      const key = b.country || 'Diğer';
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { flag: b.countryFlag, count: 1 });
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [brandsForPage]);

  const totalProducts = brandsForPage.reduce((sum, b) => sum + b.productCount, 0);

  return (
    <div className="min-h-screen bg-surface pb-20">
      {/* Hero - açık tema, lacivert yok; ülke bayrakları filtrede ve kartlarda */}
      <div className="relative bg-gradient-to-br from-primary-50 via-surface-elevated to-warning-50/50 overflow-hidden border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-4 py-1.5 mb-5" style={{ borderRadius: '4px' }}>
              <SparklesIcon className="w-3.5 h-3.5" />
              {brandsForPage.length} Üretici &middot; {totalProducts.toLocaleString('tr-TR')}+ Ürün
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-heading mb-4 tracking-tight">
              Diecast Üreticiler Rehberi
            </h1>
            <p className="text-muted max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
              Dünyanın en prestijli diecast model araba üreticilerini keşfedin. Her markanın tarihini, özel serilerini ve popüler modellerini inceleyin.
            </p>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex justify-center gap-8 sm:gap-14 mt-10"
          >
            {[
              { value: brandsForPage.length.toString(), label: 'Üretici' },
              { value: countries.length.toString(), label: 'Ülke' },
              { value: '70+', label: 'Yıllık Tarih' },
              { value: totalProducts.toLocaleString('tr-TR') + '+', label: 'Model' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-black text-heading">{stat.value}</p>
                <p className="text-xs text-muted mt-1 uppercase tracking-wider font-medium">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="sticky top-0 z-30 bg-surface-elevated border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
              <Input type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Üretici ara..."
                className="w-full bg-surface border border-border pl-9 pr-4 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-colors"
                style={{ borderRadius: '4px' }} />
            </div>

            {/* Scale Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="secondary" onClick={() => setSelectedScale(null)}
                className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${!selectedScale ? 'bg-heading text-inverted border-border-strong' : 'bg-surface-elevated text-muted border-border hover:border-border-strong'}`}
                style={{ borderRadius: '4px' }}>
                Tümü
              </Button>
              {SCALE_GROUPS.map((sg) => (
                <Button variant="secondary" key={sg.scale}
                  onClick={() => setSelectedScale(selectedScale === sg.scale ? null : sg.scale)}
                  className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${selectedScale === sg.scale ? 'bg-primary-500 text-inverted border-primary-500' : 'bg-surface-elevated text-muted border-border hover:border-primary-300'}`}
                  style={{ borderRadius: '4px' }}>
                  {sg.scale}
                </Button>
              ))}
            </div>

            {/* Country Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedCountry && (
                <Button variant="secondary" onClick={() => setSelectedCountry(null)}
                  className="px-2 py-1.5 text-xs font-semibold text-danger-500 hover:text-danger-700 transition-colors">
                  ✕
                </Button>
              )}
              {countries.slice(0, 5).map(([country, info]) => (
                <Button variant="secondary" key={country}
                  onClick={() => setSelectedCountry(selectedCountry === country ? null : country)}
                  className={`px-2.5 py-1.5 text-xs font-medium border transition-colors ${selectedCountry === country ? 'bg-primary-50 text-primary-700 border-primary-300' : 'bg-surface-elevated text-muted border-border hover:border-border'}`}
                  style={{ borderRadius: '4px' }}>
                  {info.flag} {country}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scale Info Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SCALE_GROUPS.map((sg) => {
            const count = brandsForPage.filter((b) => b.scale === sg.scale).length;
            return (
              <Button variant="secondary" key={sg.scale}
                onClick={() => setSelectedScale(selectedScale === sg.scale ? null : sg.scale)}
                className={`text-left p-3 sm:p-4 border transition-all ${selectedScale === sg.scale ? 'bg-primary-50 border-primary-300 shadow-sm' : 'bg-surface-elevated border-border hover:border-primary-200 hover:shadow-sm'}`}
                style={{ borderRadius: '4px' }}>
                <div className="text-lg sm:text-xl font-black text-heading">{sg.scale}</div>
                <div className="text-[11px] font-semibold text-primary-600 mt-0.5">{sg.label}</div>
                <div className="text-[10px] text-subtle mt-1 leading-snug">{sg.desc}</div>
                <div className="text-[10px] text-muted mt-2 font-medium">{count} üretici</div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Brand Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        {filteredBrands.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-alt mb-4" style={{ borderRadius: '4px' }}>
              <MagnifyingGlassIcon className="w-8 h-8 text-subtle" />
            </div>
            <h3 className="text-lg font-bold text-heading mb-1">Sonuç Bulunamadı</h3>
            <p className="text-sm text-muted mb-4">&quot;{searchQuery}&quot; aramasıyla eşleşen üretici yok.</p>
            <Button variant="secondary" onClick={() => { setSearchQuery(''); setSelectedScale(null); setSelectedCountry(null); }}
              className="px-5 py-2 bg-heading text-inverted text-sm font-semibold hover:bg-primary-600 transition-colors"
              style={{ borderRadius: '4px' }}>
              Filtreleri Temizle
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {filteredBrands.map((brand, idx) => (
              <motion.div
                key={brand.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.35 }}
              >
                <div
                  className={`bg-surface-elevated border transition-all overflow-hidden ${expandedBrand === brand.slug ? 'border-primary-300 shadow-md' : 'border-border hover:border-primary-200 hover:shadow-sm'}`}
                  style={{ borderRadius: '6px' }}
                >
                  {/* Brand Header - Always visible */}
                  <Button variant="secondary" onClick={() => setExpandedBrand(expandedBrand === brand.slug ? null : brand.slug)}
                    className="w-full text-left p-4 sm:p-5 flex items-center gap-4 sm:gap-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-surface border border-border-subtle flex items-center justify-center p-2 relative" style={{ borderRadius: '6px' }}>
                      {brand.logoUrl ? (
                        <Image
                          src={brand.logoUrl}
                          alt={brand.name}
                          fill
                          className="object-contain p-1"
                          sizes="80px"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xl font-bold text-subtle">{brand.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg sm:text-xl font-bold text-heading truncate">{brand.name}</h2>
                        <span className="text-sm">{brand.countryFlag}</span>
                        <span className="ml-auto flex-shrink-0 bg-primary-50 text-primary-700 text-[11px] font-bold px-2.5 py-0.5" style={{ borderRadius: '4px' }}>
                          {brand.scale}
                        </span>
                      </div>
                      <p className="text-sm text-muted line-clamp-1">{brand.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-subtle">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {brand.founded}
                        </span>
                        <span className="flex items-center gap-1">
                          <GlobeAltIcon className="w-3.5 h-3.5" />
                          {brand.parent}
                        </span>
                        <span className="font-medium text-muted">{brand.scale}</span>
                      </div>
                    </div>
                    <ChevronRightIcon className={`w-5 h-5 text-subtle flex-shrink-0 transition-transform duration-200 ${expandedBrand === brand.slug ? 'rotate-90' : ''}`} />
                  </Button>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {expandedBrand === brand.slug && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 sm:px-5 pb-5 border-t border-border-subtle pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* History - only when we have content */}
                            {(brand.history || brand.specialty) && (
                              <div className="md:col-span-2">
                                <h3 className="text-sm font-bold text-heading mb-2 flex items-center gap-1.5">
                                  <CalendarIcon className="w-4 h-4 text-primary-500" />
                                  Üretici Tarihi
                                </h3>
                                {brand.history && <p className="text-sm text-muted leading-relaxed">{brand.history}</p>}
                                {brand.specialty && (
                                  <div className="mt-4 p-3 bg-primary-50/50 border border-primary-100" style={{ borderRadius: '4px' }}>
                                    <h4 className="text-xs font-bold text-primary-700 mb-1">Uzmanlık Alanı</h4>
                                    <p className="text-xs text-primary-600">{brand.specialty}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Popular Models - only when we have models */}
                            <div className={!(brand.history || brand.specialty) ? 'md:col-span-3' : ''}>
                              <h3 className="text-sm font-bold text-heading mb-2 flex items-center gap-1.5">
                                <SparklesIcon className="w-4 h-4 text-primary-500" />
                                Popüler Modeller
                              </h3>
                              {Array.isArray(brand.popularModels) && brand.popularModels.length > 0 ? (
                              <ul className="space-y-1.5">
                                {brand.popularModels.map((model) => (
                                  <li key={model}>
                                    <Link
                                      href={`/listings?manufacturer=${encodeURIComponent(brand.name)}&search=${encodeURIComponent(model)}`}
                                      className="flex items-center gap-2 text-sm text-muted hover:text-primary-600 transition-colors group"
                                    >
                                      <span className="w-1.5 h-1.5 bg-border-strong group-hover:bg-primary-500 transition-colors flex-shrink-0" style={{ borderRadius: '1px' }} />
                                      {model}
                                      <ChevronRightIcon className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                              ) : (
                                <p className="text-sm text-muted">Bu üretici için popüler model listesi yok.</p>
                              )}

                              <Link
                                href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
                                className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                              >
                                Tüm {brand.name} ilanları
                                <ChevronRightIcon className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>

                          {/* Quick Info Bar */}
                          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-border-subtle">
                            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-heading">Kuruluş:</span>
                              <span className="text-muted">{brand.founded}, {brand.country}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-heading">Ana Şirket:</span>
                              <span className="text-muted">{brand.parent}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-heading">Ölçek:</span>
                              <span className="text-muted">{brand.scale}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-heading">Aktif İlan:</span>
                              <span className="text-primary-600 font-semibold">{brand.productCount ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-14">
        <div className="bg-surface-elevated border border-border p-5 sm:p-8" style={{ borderRadius: '6px' }}>
          <h2 className="text-xl sm:text-2xl font-black text-heading mb-2">Diecast Tarihi</h2>
          <p className="text-sm text-muted mb-8">Model araba dünyasını şekillendiren kilometre taşları</p>

          <div className="relative">
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border-subtle" />
            <div className="space-y-6">
              {[
                { year: 1912, event: 'Schuco Kuruluş', detail: 'Nürnberg, Almanya\'da Heinrich Müller tarafından kurulan Schuco, dünyanın en eski model araba markalarından biri olarak tarihe geçti.' },
                { year: 1946, event: 'Norev & Tamiya Kuruluş', detail: 'İkinci Dünya Savaşı sonrası Fransa\'da Norev ve Japonya\'da Tamiya kurularak diecast endüstrisinin temelleri atıldı.' },
                { year: 1953, event: 'Matchbox Doğuyor', detail: 'Jack Odell\'in kibrit kutusu boyutunda yaptığı küçük araba, Matchbox markasını doğurdu ve küçük ölçekli diecast devrimini başlattı.' },
                { year: 1961, event: 'Majorette Kuruluş', detail: 'Fransa\'da kurulan Majorette, Avrupa diecast pazarında önemli bir oyuncu haline geldi.' },
                { year: 1968, event: 'Hot Wheels Devrimi', detail: 'Mattel\'in Hot Wheels\'i piyasaya sürmesi diecast dünyasını kökten değiştirdi. Düşük sürtünmeli tekerlekler ve fantastik tasarımlar ile yeni bir çağ başladı.' },
                { year: 1970, event: 'Tomica Doğuyor', detail: 'Takara Tomy, Japonya\'nın kendi diecast markası Tomica\'yı piyasaya sürdü. Japon araçlarının detaylı minyatürleri ile büyük popülerlik kazandı.' },
                { year: 1974, event: 'Bburago İtalya\'dan', detail: 'İtalya\'nın Burago di Molgora kasabasından çıkan Bburago, özellikle 1:18 ölçekte Ferrari ve Lamborghini modelleri ile ün kazandı.' },
                { year: 1990, event: 'Premium Çağı Başlıyor', detail: 'Minichamps ve Maisto\'nun kurulması ile diecast dünyasında premium kalite anlayışı yaygınlaştı.' },
                { year: 1995, event: 'CMC Mükemmelliği', detail: 'CMC, elle monte edilen binlerce parçalı modelleri ile diecast\'i sanat formuna dönüştürdü.' },
                { year: 1998, event: 'AUTOart Devrimi', detail: 'AUTOart\'ın kurulması ile açılan parçalar, gerçekçi motor detayları ve premium malzeme kullanımı standart haline geldi.' },
                { year: 2018, event: 'MINI GT Yükselişi', detail: 'TSM\'nin 1:64 markası MINI GT, küçük ölçekte premium kaliteyi getirerek sektörde devrim yarattı. Kısa sürede en popüler 1:64 marka oldu.' },
              ].map((item, i) => (
                <motion.div
                  key={item.year}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-4 pl-0"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-[37px] h-[37px] bg-surface-elevated border-2 border-border flex items-center justify-center z-10 relative" style={{ borderRadius: '4px' }}>
                      <div className="w-2.5 h-2.5 bg-primary-500" style={{ borderRadius: '2px' }} />
                    </div>
                  </div>
                  <div className="pb-1 pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-primary-600 bg-primary-50 px-2 py-0.5" style={{ borderRadius: '3px' }}>{item.year}</span>
                      <span className="text-sm font-bold text-heading">{item.event}</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">{item.detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA - sadece giriş yapmamış kullanıcılara göster */}
      {!isAuthenticated && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
          <div className="bg-primary-50 border border-primary-100 p-6 sm:p-10 text-center relative overflow-hidden" style={{ borderRadius: '6px' }}>
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-black text-heading mb-3">Koleksiyonunuzu Başlatın</h2>
              <p className="text-muted mb-6 max-w-lg mx-auto text-sm sm:text-base">
                Favori markalarınızdan binlerce diecast model arasından seçim yapın. Hemen üye olun ve koleksiyonunuzu oluşturmaya başlayın.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  href="/listings"
                  className="px-6 py-2.5 bg-primary-500 text-inverted text-sm font-bold hover:bg-primary-600 transition-colors"
                  style={{ borderRadius: '4px' }}
                >
                  İlanları Keşfet
                </Link>
                <Link
                  href="/register"
                  className="px-6 py-2.5 bg-surface-elevated text-body text-sm font-bold hover:bg-surface transition-colors border border-border"
                  style={{ borderRadius: '4px' }}
                >
                  Üye Ol
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
