/** @format */

/**
 * Static fallback metadata for well-known diecast brands. The API is the source
 * of truth for which manufacturers exist and their live product counts; this
 * table only fills in logo / country / founding-year / description when the API
 * row is missing them (matched by slug or case-insensitive name).
 */
export interface BrandData {
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

export const BRANDS_DATA: BrandData[] = [
  {
    name: "Hot Wheels",
    logoUrl: "/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg",
    country: "USA",
    countryFlag: "🇺🇸",
    founded: 1968,
    parent: "Mattel",
    scale: "1:64",
    description:
      "Dünyanın en popüler diecast marka. Koleksiyonerlerin ve çocukların vazgeçilmezi.",
    history:
      "Elliot Handler tarafından 1968'de kurulan Hot Wheels, yarış performansına odaklanan ilk oyuncak araba markasıdır. İlk yılında 16 model ile başlayan marka, bugün milyarlarca araba üretti.",
    specialty:
      "Fantasy & Licensed araçlar, Treasure Hunts, Super Treasure Hunts",
    popularModels: [
      "Nissan Skyline GT-R",
      "Twin Mill",
      "'67 Camaro",
      "Bone Shaker",
      "Toyota AE86",
    ],
    productCount: 342,
    slug: "hot-wheels",
  },
  {
    name: "Matchbox",
    logoUrl: "/photos/logolar/images.png",
    country: "UK",
    countryFlag: "🇬🇧",
    founded: 1953,
    parent: "Mattel",
    scale: "1:64",
    description:
      "Gerçekçi diecast modellerin öncüsü. 70 yılı aşkın tarihi ile efsane marka.",
    history:
      "Jack Odell, 1953'te kızının okuluna kibrit kutusu boyutunda bir araba yaparak Matchbox'ı doğurdu. Gerçekçi tasarıma odaklanan marka, diecast endüstrisinin temel taşlarından biri oldu.",
    specialty: "Gerçekçi replika modeller, sürdürülebilirlik serisi",
    popularModels: [
      "Land Rover Defender",
      "Volkswagen Beetle",
      "Ford Mustang",
      "Tesla Roadster",
    ],
    productCount: 156,
    slug: "matchbox",
  },
  {
    name: "Tamiya",
    logoUrl: "/photos/logolar/tamiya-logo-png_seeklogo-324507.png",
    country: "Japan",
    countryFlag: "🇯🇵",
    founded: 1946,
    parent: "Tamiya Inc.",
    scale: "1:24",
    description: "Plastik model kit ve RC araç dünyasının lider markası.",
    history:
      "Shunsaku Tamiya tarafından 1946'da ahşap iş olarak başlayan şirket, 1960'larda plastik model kitler ile dünya çapında tanındı. Detay ve kalite standartlarını belirleyen marka olarak bilinir.",
    specialty: "Plastik model kitler, RC arabalar, detay boyama",
    popularModels: [
      "Toyota Supra",
      "Porsche 911 GT3",
      "Nissan GT-R Nismo",
      "Ferrari F40",
    ],
    productCount: 89,
    slug: "tamiya",
  },
  {
    name: "AUTOart",
    logoUrl: "/photos/logolar/download.png",
    country: "Hong Kong",
    countryFlag: "🇭🇰",
    founded: 1998,
    parent: "Creative Master International",
    scale: "1:18",
    description:
      "Ultra premium diecast modellerin zirvesi. Her detay mükemmel.",
    history:
      "AUTOart 1998'de koleksiyoner kalitesinde diecast modeller üretmek amacıyla kuruldu. Açılan kapılar, gerçekçi motor detayları ve composite body teknolojisi ile premium segmentin lideri oldu.",
    specialty: "Composite body, açılan tüm parçalar, motor detayı",
    popularModels: [
      "Koenigsegg Agera RS",
      "Lamborghini Aventador",
      "Porsche 911 GT2 RS",
      "McLaren P1",
    ],
    productCount: 124,
    slug: "autoart",
  },
  {
    name: "Kyosho",
    logoUrl: "/photos/logolar/Kyosho_corp_logo.png",
    country: "Japan",
    countryFlag: "🇯🇵",
    founded: 1963,
    parent: "Kyosho Corporation",
    scale: "1:18",
    description: "Japon hassasiyeti ile üretilen premium diecast modeller.",
    history:
      "Kyosho, RC araç teknolojisinden diecast dünyasına geçerek yüksek kaliteli ölçek modeller üretmeye başladı. Özellikle Japon araçlarındaki detay kalitesi ile tanınır.",
    specialty: "Japon araçlar, SAMURAI serisi, Jikkensha serisi",
    popularModels: [
      "Nissan Skyline GT-R",
      "Toyota 2000GT",
      "Mazda Cosmo",
      "Honda NSX",
    ],
    productCount: 78,
    slug: "kyosho",
  },
  {
    name: "Maisto",
    logoUrl: "/photos/logolar/maisto-logo.png",
    country: "Thailand",
    countryFlag: "🇹🇭",
    founded: 1990,
    parent: "May Cheong Group",
    scale: "1:18",
    description:
      "Uygun fiyatlı premium kalite. Koleksiyona başlamak için ideal.",
    history:
      "May Cheong Group'un premium markası olarak 1990'da kurulan Maisto, kalite ve fiyat dengesinde sektörün en iyileri arasına girdi. Special Edition ve Premiere serileri ile geniş bir koleksiyoner kitlesine ulaşır.",
    specialty: "Geniş araç yelpazesi, uygun fiyat, Special Edition serisi",
    popularModels: [
      "Bugatti Chiron",
      "Ferrari LaFerrari",
      "Lamborghini Centenario",
      "Mercedes-AMG GT",
    ],
    productCount: 201,
    slug: "maisto",
  },
  {
    name: "Bburago",
    logoUrl: "/photos/logolar/Bburago_Logo.png",
    country: "Italy",
    countryFlag: "🇮🇹",
    founded: 1974,
    parent: "Maisto (May Cheong)",
    scale: "1:18",
    description: "İtalyan tasarım geleneği ile üretilen diecast klasik.",
    history:
      "İtalya'nın Burago di Molgora kasabasında 1974'te kurulan Bburago, özellikle Ferrari, Lamborghini gibi İtalyan süper araçların modellerinde uzmanlaştı. 2005'te Maisto tarafından satın alındı.",
    specialty: "Ferrari lisanslı modeller, İtalyan süper arabalar",
    popularModels: [
      "Ferrari 488 GTB",
      "Lamborghini Huracán",
      "Alfa Romeo Giulia",
      "Porsche 911",
    ],
    productCount: 167,
    slug: "bburago",
  },
  {
    name: "Greenlight",
    logoUrl: "/photos/logolar/Greenlight_collectibles_logo.png",
    country: "USA",
    countryFlag: "🇺🇸",
    founded: 2002,
    parent: "Greenlight Collectibles",
    scale: "1:64",
    description:
      "Film ve TV araçlarının efsane üreticisi. Koleksiyoner odaklı.",
    history:
      "Greenlight, film ve televizyon araçlarını lisanslı olarak üreten öncü marka. Hollywood, Hobby Exclusive ve Green Machine chase modelleri ile koleksiyonerlerin gözdesi.",
    specialty: "Film/TV araçları, Green Machine chase, Hollywood serisi",
    popularModels: [
      "Supernatural Impala",
      "Gone in 60 Seconds Eleanor",
      "Breaking Bad RV",
      "John Wick Mustang",
    ],
    productCount: 245,
    slug: "greenlight",
  },
  {
    name: "Minichamps",
    logoUrl: "/photos/logolar/minichamps_logo.png",
    country: "Germany",
    countryFlag: "🇩🇪",
    founded: 1990,
    parent: "Paul's Model Art",
    scale: "1:43",
    description: "Alman mühendislik hassasiyeti ile üretilen yarış modelleri.",
    history:
      "Paul Lang tarafından 1990'da kurulan Minichamps, özellikle Formula 1 ve DTM yarış araçlarının detaylı replikaları ile tanınır. 1:43 ölçekte dünyanın en büyük üreticisidir.",
    specialty: "F1 araçlar, DTM, Le Mans serisi, limited edition",
    popularModels: [
      "Mercedes-AMG F1 W11",
      "Porsche 917K",
      "BMW M3 E30",
      "Audi Quattro",
    ],
    productCount: 312,
    slug: "minichamps",
  },
  {
    name: "MINI GT",
    logoUrl: "/photos/logolar/mini-gt-logo-png_seeklogo-523421.png",
    country: "Hong Kong",
    countryFlag: "🇭🇰",
    founded: 2018,
    parent: "True Scale Miniatures",
    scale: "1:64",
    description: "1:64 ölçeğin yeni standardı. Detay ve kalitede devrim.",
    history:
      "TSM'nin 1:64 markası olarak 2018'de kurulan MINI GT, kısa sürede koleksiyonerlerin en çok tercih ettiği 1:64 premium marka haline geldi. Gerçekçi boya, detaylı jantlar ve geniş model yelpazesi ile öne çıkar.",
    specialty: "Premium 1:64, detaylı jantlar, geniş lisans portföyü",
    popularModels: [
      "Lamborghini Huracán STO",
      "Porsche 911 GT3",
      "Nissan GT-R R35",
      "BMW M4 CSL",
    ],
    productCount: 456,
    slug: "mini-gt",
  },
  {
    name: "Tomica",
    logoUrl: "/photos/logolar/Tomica_brand_textlogo.png",
    country: "Japan",
    countryFlag: "🇯🇵",
    founded: 1970,
    parent: "Takara Tomy",
    scale: "1:64",
    description: "Japonya'nın efsanevi diecast markası. 50+ yıllık gelenek.",
    history:
      "Takara Tomy tarafından 1970'te kurulan Tomica, Japon araç pazarına odaklanan küçük ölçekli diecast modelleri ile bilinir. Premium ve Limited Vintage serileri koleksiyonerlerin gözdesidir.",
    specialty: "Japon araçlar, Premium serisi, Limited Vintage Neo",
    popularModels: [
      "Toyota AE86 Sprinter",
      "Nissan Fairlady Z",
      "Honda Civic Type R",
      "Suzuki Jimny",
    ],
    productCount: 198,
    slug: "tomica",
  },
  {
    name: "Majorette",
    logoUrl: "/photos/logolar/majorette-logo-png_seeklogo-492958.png",
    country: "France",
    countryFlag: "🇫🇷",
    founded: 1961,
    parent: "Simba Dickie Group",
    scale: "1:64",
    description: "Fransız diecast geleneği. Avrupa araçlarında uzman.",
    history:
      "Fransa'da 1961'de kurulan Majorette, özellikle Avrupa araç markalarının detaylı 1:64 replikaları ile tanınır. Premium Cars ve Limited Edition serileri ile kalitesini sürekli artırmaktadır.",
    specialty: "Premium Cars, Avrupa araçları, Deluxe serisi",
    popularModels: [
      "Porsche 911 Carrera S",
      "Mercedes-AMG GT",
      "Renault Megane RS",
      "Volkswagen Golf GTI",
    ],
    productCount: 134,
    slug: "majorette",
  },
  {
    name: "GT Spirit",
    logoUrl: "/photos/logolar/GT-Spirit-Logo.webp",
    country: "France",
    countryFlag: "🇫🇷",
    founded: 2012,
    parent: "Ottomobile",
    scale: "1:18",
    description: "Resin model dünyasının yükselen yıldızı.",
    history:
      "Ottomobile'in kardeş markası olarak 2012'de kurulan GT Spirit, sealed resin body modelleri ile tanınır. Özellikle modern süper araçlar ve tuning araçlarında geniş ürün yelpazesi sunar.",
    specialty: "Resin modeller, modern süper arabalar, tuning versiyonlar",
    popularModels: [
      "Nissan GT-R R35 Nismo",
      "Porsche 911 Turbo S",
      "Audi RS6 Avant",
      "BMW M3 Competition",
    ],
    productCount: 89,
    slug: "gt-spirit",
  },
  {
    name: "CMC",
    logoUrl: "/photos/logolar/cmc_logo-640x320.jpg",
    country: "Germany",
    countryFlag: "🇩🇪",
    founded: 1995,
    parent: "Classic Model Cars",
    scale: "1:18",
    description: "Diecast sanatının zirvesi. Müze kalitesinde modeller.",
    history:
      "Alman mühendislik mükemmelliğinin diecast'e yansıması olan CMC, her modeli binlerce parçadan elle monte eder. Mercedes-Benz Silver Arrow'dan Ferrari 250 GTO'ya kadar klasik yarış araçlarının en detaylı replikalarını üretir.",
    specialty: "Elle montaj, 2000+ parça, klasik yarış araçları",
    popularModels: [
      "Mercedes-Benz W196",
      "Ferrari 250 GTO",
      "Auto Union Type C",
      "Maserati 300S",
    ],
    productCount: 45,
    slug: "cmc",
  },
  {
    name: "Norev",
    logoUrl: "/photos/logolar/5bc0b46797d85-thumbnail.jpg",
    country: "France",
    countryFlag: "🇫🇷",
    founded: 1946,
    parent: "Norev SAS",
    scale: "1:18",
    description: "Fransız otomobil mirasının sadık koruyucusu.",
    history:
      "Joseph Véron tarafından 1946'da kurulan Norev, başlangıçta Fransız araçlara odaklandı. Bugün tüm büyük Avrupa markalarının lisanslı modellerini üretir ve 1:18 ölçekte kalite/fiyat dengesinin en iyisi kabul edilir.",
    specialty: "Fransız araçlar, dealer edition, uygun fiyatlı 1:18",
    popularModels: [
      "Peugeot 205 GTI",
      "Renault Alpine A110",
      "Mercedes-Benz S-Class",
      "Citroën DS",
    ],
    productCount: 178,
    slug: "norev",
  },
  {
    name: "Schuco",
    logoUrl:
      "/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg",
    country: "Germany",
    countryFlag: "🇩🇪",
    founded: 1912,
    parent: "Simba Dickie Group",
    scale: "1:43",
    description: "110 yılı aşan Alman diecast geleneği.",
    history:
      "Heinrich Müller tarafından 1912'de Nürnberg'de kurulan Schuco, dünyanın en eski oyuncak ve model araba markalarından biridir. Alman araçlarının detaylı modellerini üretmeye devam etmektedir.",
    specialty: "Klasik Alman araçlar, Volkswagen, Porsche serileri",
    popularModels: [
      "Volkswagen T1 Bus",
      "Porsche 356",
      "BMW Isetta",
      "Mercedes-Benz 300 SL",
    ],
    productCount: 92,
    slug: "schuco",
  },
];

/** Diecast history milestones for the timeline section. */
export const DIECAST_TIMELINE: Array<{
  year: number;
  event: string;
  detail: string;
}> = [
  {
    year: 1912,
    event: "Schuco Kuruluş",
    detail:
      "Nürnberg, Almanya'da Heinrich Müller tarafından kurulan Schuco, dünyanın en eski model araba markalarından biri olarak tarihe geçti.",
  },
  {
    year: 1946,
    event: "Norev & Tamiya Kuruluş",
    detail:
      "İkinci Dünya Savaşı sonrası Fransa'da Norev ve Japonya'da Tamiya kurularak diecast endüstrisinin temelleri atıldı.",
  },
  {
    year: 1953,
    event: "Matchbox Doğuyor",
    detail:
      "Jack Odell'in kibrit kutusu boyutunda yaptığı küçük araba, Matchbox markasını doğurdu ve küçük ölçekli diecast devrimini başlattı.",
  },
  {
    year: 1961,
    event: "Majorette Kuruluş",
    detail:
      "Fransa'da kurulan Majorette, Avrupa diecast pazarında önemli bir oyuncu haline geldi.",
  },
  {
    year: 1968,
    event: "Hot Wheels Devrimi",
    detail:
      "Mattel'in Hot Wheels'i piyasaya sürmesi diecast dünyasını kökten değiştirdi. Düşük sürtünmeli tekerlekler ve fantastik tasarımlar ile yeni bir çağ başladı.",
  },
  {
    year: 1970,
    event: "Tomica Doğuyor",
    detail:
      "Takara Tomy, Japonya'nın kendi diecast markası Tomica'yı piyasaya sürdü. Japon araçlarının detaylı minyatürleri ile büyük popülerlik kazandı.",
  },
  {
    year: 1974,
    event: "Bburago İtalya'dan",
    detail:
      "İtalya'nın Burago di Molgora kasabasından çıkan Bburago, özellikle 1:18 ölçekte Ferrari ve Lamborghini modelleri ile ün kazandı.",
  },
  {
    year: 1990,
    event: "Premium Çağı Başlıyor",
    detail:
      "Minichamps ve Maisto'nun kurulması ile diecast dünyasında premium kalite anlayışı yaygınlaştı.",
  },
  {
    year: 1995,
    event: "CMC Mükemmelliği",
    detail:
      "CMC, elle monte edilen binlerce parçalı modelleri ile diecast'i sanat formuna dönüştürdü.",
  },
  {
    year: 1998,
    event: "AUTOart Devrimi",
    detail:
      "AUTOart'ın kurulması ile açılan parçalar, gerçekçi motor detayları ve premium malzeme kullanımı standart haline geldi.",
  },
  {
    year: 2018,
    event: "MINI GT Yükselişi",
    detail:
      "TSM'nin 1:64 markası MINI GT, küçük ölçekte premium kaliteyi getirerek sektörde devrim yarattı. Kısa sürede en popüler 1:64 marka oldu.",
  },
];
