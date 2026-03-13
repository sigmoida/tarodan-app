'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/i18n/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, ChevronRightIcon, GlobeAltIcon, CalendarIcon, SparklesIcon } from '@heroicons/react/24/outline';

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

export default function BrandsPage() {
  const { t, locale } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScale, setSelectedScale] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const filteredBrands = useMemo(() => {
    let result = BRANDS_DATA.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.country.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesScale = !selectedScale || b.scale === selectedScale;
      const matchesCountry = !selectedCountry || b.country === selectedCountry;
      return matchesSearch && matchesScale && matchesCountry;
    });
    return result;
  }, [searchQuery, selectedScale, selectedCountry]);

  const countries = useMemo(() => {
    const map = new Map<string, { flag: string; count: number }>();
    BRANDS_DATA.forEach((b) => {
      const existing = map.get(b.country);
      if (existing) {
        existing.count++;
      } else {
        map.set(b.country, { flag: b.countryFlag, count: 1 });
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, []);

  const totalProducts = BRANDS_DATA.reduce((sum, b) => sum + b.productCount, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Hero */}
      <div className="relative bg-gray-900 overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.03) 35px, rgba(255,255,255,0.03) 70px)',
          }} />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-widest px-4 py-1.5 mb-5" style={{ borderRadius: '4px' }}>
              <SparklesIcon className="w-3.5 h-3.5" />
              {BRANDS_DATA.length} Marka &middot; {totalProducts.toLocaleString('tr-TR')}+ Ürün
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
              Diecast Markalar Rehberi
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
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
              { value: BRANDS_DATA.length.toString(), label: 'Marka' },
              { value: '8', label: 'Ülke' },
              { value: '70+', label: 'Yıllık Tarih' },
              { value: totalProducts.toLocaleString('tr-TR') + '+', label: 'Model' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-black text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-medium">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Marka ara..."
                className="w-full bg-gray-50 border border-gray-200 pl-9 pr-4 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                style={{ borderRadius: '4px' }}
              />
            </div>

            {/* Scale Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedScale(null)}
                className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${!selectedScale ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                style={{ borderRadius: '4px' }}
              >
                Tümü
              </button>
              {SCALE_GROUPS.map((sg) => (
                <button
                  key={sg.scale}
                  onClick={() => setSelectedScale(selectedScale === sg.scale ? null : sg.scale)}
                  className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${selectedScale === sg.scale ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}
                  style={{ borderRadius: '4px' }}
                >
                  {sg.scale}
                </button>
              ))}
            </div>

            {/* Country Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedCountry && (
                <button
                  onClick={() => setSelectedCountry(null)}
                  className="px-2 py-1.5 text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                >
                  ✕
                </button>
              )}
              {countries.slice(0, 5).map(([country, info]) => (
                <button
                  key={country}
                  onClick={() => setSelectedCountry(selectedCountry === country ? null : country)}
                  className={`px-2.5 py-1.5 text-xs font-medium border transition-colors ${selectedCountry === country ? 'bg-orange-50 text-orange-700 border-orange-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  style={{ borderRadius: '4px' }}
                >
                  {info.flag} {country}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scale Info Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SCALE_GROUPS.map((sg) => {
            const count = BRANDS_DATA.filter((b) => b.scale === sg.scale).length;
            return (
              <button
                key={sg.scale}
                onClick={() => setSelectedScale(selectedScale === sg.scale ? null : sg.scale)}
                className={`text-left p-3 sm:p-4 border transition-all ${selectedScale === sg.scale ? 'bg-orange-50 border-orange-300 shadow-sm' : 'bg-white border-gray-200 hover:border-orange-200 hover:shadow-sm'}`}
                style={{ borderRadius: '4px' }}
              >
                <div className="text-lg sm:text-xl font-black text-gray-900">{sg.scale}</div>
                <div className="text-[11px] font-semibold text-orange-600 mt-0.5">{sg.label}</div>
                <div className="text-[10px] text-gray-400 mt-1 leading-snug">{sg.desc}</div>
                <div className="text-[10px] text-gray-500 mt-2 font-medium">{count} marka</div>
              </button>
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
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 mb-4" style={{ borderRadius: '4px' }}>
              <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Sonuç Bulunamadı</h3>
            <p className="text-sm text-gray-500 mb-4">&quot;{searchQuery}&quot; aramasıyla eşleşen marka yok.</p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedScale(null); setSelectedCountry(null); }}
              className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              style={{ borderRadius: '4px' }}
            >
              Filtreleri Temizle
            </button>
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
                  className={`bg-white border transition-all overflow-hidden ${expandedBrand === brand.slug ? 'border-orange-300 shadow-md' : 'border-gray-200 hover:border-orange-200 hover:shadow-sm'}`}
                  style={{ borderRadius: '6px' }}
                >
                  {/* Brand Header - Always visible */}
                  <button
                    onClick={() => setExpandedBrand(expandedBrand === brand.slug ? null : brand.slug)}
                    className="w-full text-left p-4 sm:p-5 flex items-center gap-4 sm:gap-5"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-gray-50 border border-gray-100 flex items-center justify-center p-2 relative" style={{ borderRadius: '6px' }}>
                      <Image
                        src={brand.logoUrl}
                        alt={brand.name}
                        fill
                        className="object-contain p-1"
                        sizes="80px"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{brand.name}</h2>
                        <span className="text-sm">{brand.countryFlag}</span>
                        <span className="ml-auto flex-shrink-0 bg-orange-50 text-orange-700 text-[11px] font-bold px-2.5 py-0.5" style={{ borderRadius: '4px' }}>
                          {brand.scale}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-1">{brand.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {brand.founded}
                        </span>
                        <span className="flex items-center gap-1">
                          <GlobeAltIcon className="w-3.5 h-3.5" />
                          {brand.parent}
                        </span>
                        <span className="font-medium text-gray-600">{brand.productCount} ürün</span>
                      </div>
                    </div>
                    <ChevronRightIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${expandedBrand === brand.slug ? 'rotate-90' : ''}`} />
                  </button>

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
                        <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* History */}
                            <div className="md:col-span-2">
                              <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                                <CalendarIcon className="w-4 h-4 text-orange-500" />
                                Marka Tarihi
                              </h3>
                              <p className="text-sm text-gray-600 leading-relaxed">{brand.history}</p>
                              <div className="mt-4 p-3 bg-orange-50/50 border border-orange-100" style={{ borderRadius: '4px' }}>
                                <h4 className="text-xs font-bold text-orange-700 mb-1">Uzmanlık Alanı</h4>
                                <p className="text-xs text-orange-600">{brand.specialty}</p>
                              </div>
                            </div>

                            {/* Popular Models */}
                            <div>
                              <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                                <SparklesIcon className="w-4 h-4 text-orange-500" />
                                Popüler Modeller
                              </h3>
                              <ul className="space-y-1.5">
                                {brand.popularModels.map((model) => (
                                  <li key={model}>
                                    <Link
                                      href={`/listings?brand=${encodeURIComponent(brand.name)}&q=${encodeURIComponent(model)}`}
                                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-orange-600 transition-colors group"
                                    >
                                      <span className="w-1.5 h-1.5 bg-gray-300 group-hover:bg-orange-500 transition-colors flex-shrink-0" style={{ borderRadius: '1px' }} />
                                      {model}
                                      <ChevronRightIcon className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </Link>
                                  </li>
                                ))}
                              </ul>

                              <Link
                                href={`/listings?brand=${encodeURIComponent(brand.name)}`}
                                className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                              >
                                Tüm {brand.name} ilanları
                                <ChevronRightIcon className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>

                          {/* Quick Info Bar */}
                          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-gray-900">Kuruluş:</span>
                              <span className="text-gray-600">{brand.founded}, {brand.country}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-gray-900">Ana Şirket:</span>
                              <span className="text-gray-600">{brand.parent}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-gray-900">Ölçek:</span>
                              <span className="text-gray-600">{brand.scale}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs" style={{ borderRadius: '4px' }}>
                              <span className="font-bold text-gray-900">Aktif İlan:</span>
                              <span className="text-orange-600 font-semibold">{brand.productCount}</span>
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
        <div className="bg-white border border-gray-200 p-5 sm:p-8" style={{ borderRadius: '6px' }}>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">Diecast Tarihi</h2>
          <p className="text-sm text-gray-500 mb-8">Model araba dünyasını şekillendiren kilometre taşları</p>

          <div className="relative">
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gray-200" />
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
                    <div className="w-[37px] h-[37px] bg-white border-2 border-gray-200 flex items-center justify-center z-10 relative" style={{ borderRadius: '4px' }}>
                      <div className="w-2.5 h-2.5 bg-orange-500" style={{ borderRadius: '2px' }} />
                    </div>
                  </div>
                  <div className="pb-1 pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5" style={{ borderRadius: '3px' }}>{item.year}</span>
                      <span className="text-sm font-bold text-gray-900">{item.event}</span>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        <div className="bg-gray-900 p-6 sm:p-10 text-center relative overflow-hidden" style={{ borderRadius: '6px' }}>
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.05) 35px, rgba(255,255,255,0.05) 70px)',
          }} />
          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Koleksiyonunuzu Başlatın</h2>
            <p className="text-gray-400 mb-6 max-w-lg mx-auto text-sm sm:text-base">
              Favori markalarınızdan binlerce diecast model arasından seçim yapın. Hemen üye olun ve koleksiyonunuzu oluşturmaya başlayın.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/listings"
                className="px-6 py-2.5 bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors"
                style={{ borderRadius: '4px' }}
              >
                İlanları Keşfet
              </Link>
              <Link
                href="/register"
                className="px-6 py-2.5 bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-colors border border-white/20"
                style={{ borderRadius: '4px' }}
              >
                Üye Ol
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
