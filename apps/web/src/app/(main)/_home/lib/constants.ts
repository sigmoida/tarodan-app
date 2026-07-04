import type { FeaturedBusiness, FeaturedCollector } from "./types";

export const BRANDS = [
  {
    name: "Hot Wheels",
    logoUrl: "/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg",
    desc: "Mattel",
    scale: "1:64",
  },
  {
    name: "Matchbox",
    logoUrl: "/photos/logolar/images.png",
    desc: "Mattel",
    scale: "1:64",
  },
  {
    name: "Tamiya",
    logoUrl: "/photos/logolar/tamiya-logo-png_seeklogo-324507.png",
    desc: "Japan",
    scale: "1:24",
  },
  {
    name: "AUTOart",
    logoUrl: "/photos/logolar/download.png",
    desc: "Premium",
    scale: "1:18",
  },
  {
    name: "Kyosho",
    logoUrl: "/photos/logolar/Kyosho_corp_logo.png",
    desc: "Japan",
    scale: "1:18",
  },
  {
    name: "Maisto",
    logoUrl: "/photos/logolar/maisto-logo.png",
    desc: "May Cheong",
    scale: "1:18",
  },
  {
    name: "Bburago",
    logoUrl: "/photos/logolar/Bburago_Logo.png",
    desc: "Italy",
    scale: "1:18",
  },
  {
    name: "Greenlight",
    logoUrl: "/photos/logolar/Greenlight_collectibles_logo.png",
    desc: "USA",
    scale: "1:64",
  },
  {
    name: "Minichamps",
    logoUrl: "/photos/logolar/minichamps_logo.png",
    desc: "Germany",
    scale: "1:43",
  },
  {
    name: "MINI GT",
    logoUrl: "/photos/logolar/mini-gt-logo-png_seeklogo-523421.png",
    desc: "TSM",
    scale: "1:64",
  },
  {
    name: "Tomica",
    logoUrl: "/photos/logolar/Tomica_brand_textlogo.png",
    desc: "Takara Tomy",
    scale: "1:64",
  },
  {
    name: "Majorette",
    logoUrl: "/photos/logolar/majorette-logo-png_seeklogo-492958.png",
    desc: "Simba",
    scale: "1:64",
  },
  {
    name: "GT Spirit",
    logoUrl: "/photos/logolar/GT-Spirit-Logo.webp",
    desc: "France",
    scale: "1:18",
  },
  {
    name: "CMC",
    logoUrl: "/photos/logolar/cmc_logo-640x320.jpg",
    desc: "Germany",
    scale: "1:18",
  },
  {
    name: "Norev",
    logoUrl: "/photos/logolar/5bc0b46797d85-thumbnail.jpg",
    desc: "France",
    scale: "1:18",
  },
  {
    name: "Schuco",
    logoUrl:
      "/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg",
    desc: "Germany",
    scale: "1:43",
  },
];

export const DEMO_PRODUCT_IMAGES = [
  "https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels+Skyline",
  "https://placehold.co/400x400/e3f2fd/1565c0?text=AUTOart+GT-R",
  "https://placehold.co/400x400/fce4ec/c62828?text=Ferrari+F40",
  "https://placehold.co/400x400/e8f5e9/2e7d32?text=Porsche+911",
  "https://placehold.co/400x400/f3e5f5/6a1b9a?text=Lamborghini+SV",
  "https://placehold.co/400x400/fff8e1/f57f17?text=McLaren+P1",
];

export const DEMO_COLLECTIONS: FeaturedCollector[] = [
  {
    id: "demo-1",
    name: "JDM Legends Koleksiyonu",
    description:
      "Japon otomobil efsaneleri - Skyline, Supra, RX-7 ve daha fazlası",
    viewCount: 3250,
    likeCount: 187,
    itemCount: 24,
    user: { id: "demo-u1", displayName: "TunerKing34", isVerified: true },
    items: [
      {
        id: "d1",
        productId: "",
        productTitle: "Nissan Skyline GT-R R34",
        productPrice: 850,
        productImage: "https://placehold.co/200x200/e3f2fd/1565c0?text=R34",
      },
      {
        id: "d2",
        productId: "",
        productTitle: "Toyota Supra MK4",
        productPrice: 720,
        productImage: "https://placehold.co/200x200/fff3e0/e65100?text=Supra",
      },
      {
        id: "d3",
        productId: "",
        productTitle: "Mazda RX-7 FD",
        productPrice: 650,
        productImage: "https://placehold.co/200x200/fce4ec/c62828?text=RX-7",
      },
      {
        id: "d4",
        productId: "",
        productTitle: "Honda NSX",
        productPrice: 900,
        productImage: "https://placehold.co/200x200/e8f5e9/2e7d32?text=NSX",
      },
    ],
  },
  {
    id: "demo-2",
    name: "Ferrari Rosso Corsa",
    description: "Kırmızının 50 tonu - En özel Ferrari modelleri",
    viewCount: 4100,
    likeCount: 231,
    itemCount: 18,
    user: { id: "demo-u2", displayName: "ScuderiaCollector", isVerified: true },
    items: [
      {
        id: "d5",
        productId: "",
        productTitle: "Ferrari F40",
        productPrice: 1200,
        productImage: "https://placehold.co/200x200/fce4ec/c62828?text=F40",
      },
      {
        id: "d6",
        productId: "",
        productTitle: "Ferrari 250 GTO",
        productPrice: 2500,
        productImage: "https://placehold.co/200x200/ffebee/b71c1c?text=250+GTO",
      },
      {
        id: "d7",
        productId: "",
        productTitle: "Ferrari SF90",
        productPrice: 980,
        productImage: "https://placehold.co/200x200/fce4ec/d32f2f?text=SF90",
      },
      {
        id: "d8",
        productId: "",
        productTitle: "Ferrari Testarossa",
        productPrice: 850,
        productImage:
          "https://placehold.co/200x200/ffcdd2/c62828?text=Testarossa",
      },
    ],
  },
  {
    id: "demo-3",
    name: "German Engineering",
    description: "Porsche, BMW, Mercedes - Alman mühendisliğinin en iyileri",
    viewCount: 2870,
    likeCount: 156,
    itemCount: 32,
    user: { id: "demo-u3", displayName: "AutoBahnRacer", isVerified: false },
    items: [
      {
        id: "d9",
        productId: "",
        productTitle: "Porsche 911 GT3",
        productPrice: 780,
        productImage: "https://placehold.co/200x200/e8f5e9/2e7d32?text=911+GT3",
      },
      {
        id: "d10",
        productId: "",
        productTitle: "BMW M3 E30",
        productPrice: 650,
        productImage: "https://placehold.co/200x200/e3f2fd/1565c0?text=M3+E30",
      },
      {
        id: "d11",
        productId: "",
        productTitle: "Mercedes 300SL",
        productPrice: 1100,
        productImage: "https://placehold.co/200x200/f5f5f5/616161?text=300SL",
      },
      {
        id: "d12",
        productId: "",
        productTitle: "Audi Quattro",
        productPrice: 550,
        productImage: "https://placehold.co/200x200/fff8e1/f57f17?text=Quattro",
      },
    ],
  },
];

export const DEMO_FEATURED_COLLECTOR: FeaturedCollector = {
  id: "demo-fc",
  name: "Ultimate Supercar Garage",
  description:
    "Dünyanın en nadir ve değerli süper otomobil modellerinin koleksiyonu. 1:18 ölçek premium modeller.",
  viewCount: 8750,
  likeCount: 542,
  itemCount: 45,
  user: {
    id: "demo-fcu",
    displayName: "SupercarHunter",
    avatarUrl: undefined,
    bio: "Premium diecast koleksiyoner",
    isVerified: true,
  },
  items: [
    {
      id: "dfc1",
      productId: "",
      productTitle: "Bugatti Chiron",
      productPrice: 1450,
      productImage: "https://placehold.co/200x200/e3f2fd/0d47a1?text=Chiron",
    },
    {
      id: "dfc2",
      productId: "",
      productTitle: "McLaren P1",
      productPrice: 1200,
      productImage: "https://placehold.co/200x200/fff8e1/f57f17?text=P1",
    },
    {
      id: "dfc3",
      productId: "",
      productTitle: "Pagani Huayra",
      productPrice: 1800,
      productImage: "https://placehold.co/200x200/f3e5f5/6a1b9a?text=Huayra",
    },
  ],
};

export const DEMO_COMPANY: FeaturedBusiness = {
  id: "demo-biz",
  displayName: "DiecastTR Premium",
  companyName: "DiecastTR Premium Mağaza",
  bio: "Türkiye'nin lider diecast model otomobil mağazası. Orijinal ve lisanslı ürünler.",
  isVerified: true,
  stats: {
    totalProducts: 156,
    totalViews: 45200,
    totalLikes: 3200,
    totalSales: 890,
    averageRating: 4.8,
    totalRatings: 324,
  },
  collections: [],
  products: [
    {
      id: "dbp1",
      title: "AUTOart Nissan GT-R R35",
      price: 1350,
      viewCount: 2100,
      likeCount: 145,
      image: "https://placehold.co/200x200/e3f2fd/1565c0?text=GT-R+R35",
    },
    {
      id: "dbp2",
      title: "CMC Ferrari 250 GTO",
      price: 4500,
      viewCount: 3400,
      likeCount: 267,
      image: "https://placehold.co/200x200/fce4ec/c62828?text=250+GTO",
    },
    {
      id: "dbp3",
      title: "Kyosho Lamborghini Countach",
      price: 980,
      viewCount: 1800,
      likeCount: 98,
      image: "https://placehold.co/200x200/fff8e1/f57f17?text=Countach",
    },
    {
      id: "dbp4",
      title: "Minichamps Porsche 911 GT3",
      price: 1150,
      viewCount: 2500,
      likeCount: 176,
      image: "https://placehold.co/200x200/e8f5e9/2e7d32?text=911+GT3",
    },
    {
      id: "dbp5",
      title: "GT Spirit BMW M3 E30",
      price: 890,
      viewCount: 1950,
      likeCount: 132,
      image: "https://placehold.co/200x200/e3f2fd/0d47a1?text=M3+E30",
    },
  ],
};
