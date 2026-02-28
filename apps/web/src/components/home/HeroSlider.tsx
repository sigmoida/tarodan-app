'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import Button from '@/components/ui/Button';

const HERO_SLIDES = {
  tr: [
    {
      title: "Türkiye'nin En Büyük\nDiecast Pazaryeri",
      subtitle:
        'Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.',
      cta1: { label: 'Koleksiyonları Keşfet', href: '/collections' },
      cta2: { label: 'Pazaryerini İncele', href: '/listings' },
      image: '/photos/colorful-car-toys.jpg',
      imageRight: true,
      requiresAuth: false,
    },
    {
      title: 'Premium Hot Wheels\nKoleksiyonları',
      subtitle:
        'Fast & Furious, Formula 1 ve daha fazlası. Nadir bulunan modelleri keşfedin.',
      cta1: { label: 'Hot Wheels Keşfet', href: '/listings?manufacturer=Hot Wheels' },
      cta2: { label: 'Tüm Markalar', href: '/listings' },
      image: '/photos/toy-cars-row-1.jpg',
      imageRight: false,
      requiresAuth: false,
    },
    {
      title: 'Güvenli Takas\nSistemi',
      subtitle:
        'Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Her iki taraf için korumalı sistem.',
      cta1: { label: 'Takasa Başla', href: '/trades' },
      cta2: { label: 'Nasıl Çalışır?', href: '/guvenli-takas' },
      image: '/photos/colorful-car-toys.jpg',
      imageRight: true,
      requiresAuth: true,
    },
  ],
  en: [
    {
      title: "Turkey's Largest\nDiecast Marketplace",
      subtitle:
        'Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.',
      cta1: { label: 'Explore Collections', href: '/collections' },
      cta2: { label: 'Browse Marketplace', href: '/listings' },
      image: '/photos/colorful-car-toys.jpg',
      imageRight: true,
      requiresAuth: false,
    },
    {
      title: 'Premium Hot Wheels\nCollections',
      subtitle:
        'Fast & Furious, Formula 1 and more. Discover rare models.',
      cta1: { label: 'Explore Hot Wheels', href: '/listings?manufacturer=Hot Wheels' },
      cta2: { label: 'All Brands', href: '/listings' },
      image: '/photos/toy-cars-row-1.jpg',
      imageRight: false,
      requiresAuth: false,
    },
    {
      title: 'Secure Trading\nSystem',
      subtitle:
        'Trade your collections with other collectors safely. Protected system for both parties.',
      cta1: { label: 'Start Trading', href: '/trades' },
      cta2: { label: 'How It Works?', href: '/guvenli-takas' },
      image: '/photos/colorful-car-toys.jpg',
      imageRight: true,
      requiresAuth: true,
    },
  ],
};

export default function HeroSlider() {
  const { locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = HERO_SLIDES[locale as 'tr' | 'en'];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

  const slide = slides[currentSlide];

  const textContent = (
    <motion.div
      key={`text-${currentSlide}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 }}
    >
      <h1 className="text-3xl md:text-4xl lg:text-[3.25rem] font-bold text-heading font-display leading-[1.1] tracking-tight mb-6 whitespace-pre-line">
        {slide.title}
      </h1>
      <p className="text-base md:text-lg text-muted mb-6 max-w-lg leading-relaxed">
        {slide.subtitle}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="primary" size="md" href={slide.cta1.href}>
          {slide.cta1.label}
        </Button>
        <Button variant="secondary" size="md" href={slide.cta2.href}>
          {slide.cta2.label}
        </Button>
      </div>
    </motion.div>
  );

  const imageContent = (
    <motion.div
      key={`img-${currentSlide}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.25 }}
      className="relative hidden md:block aspect-[4/3] w-full max-w-3xl overflow-hidden border border-gray-200 bg-white" style={{borderRadius:'4px'}}
    >
      <Image
        src={slide.image}
        alt={locale === 'tr' ? 'Diecast model araç koleksiyonu' : 'Diecast model car collection'}
        fill
        sizes="(max-width: 768px) 0px, (max-width: 1024px) 400px, 512px"
        className="object-cover object-center"
        priority
        quality={90}
        unoptimized={slide.image.startsWith('http')}
      />
    </motion.div>
  );

  return (
    <section className="relative overflow-hidden bg-white">
      <AnimatePresence initial={false}>
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32 relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {slide.imageRight ? (
                <>{textContent}{imageContent}</>
              ) : (
                <>{imageContent}{textContent}</>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white shadow-soft flex items-center justify-center transition-all duration-200 z-10 border border-gray-200"
        style={{borderRadius:'4px'}}
        aria-label="Previous slide"
      >
        <ChevronLeftIcon className="w-4 h-4 text-heading" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white shadow-soft flex items-center justify-center transition-all duration-200 z-10 border border-gray-200"
        style={{borderRadius:'4px'}}
        aria-label="Next slide"
      >
        <ChevronRightIcon className="w-4 h-4 text-heading" />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`h-2 rounded-full transition-all duration-300 ease-premium ${
              index === currentSlide
                ? 'bg-primary-500 w-8'
                : 'bg-gray-300 w-2 hover:bg-gray-400'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
