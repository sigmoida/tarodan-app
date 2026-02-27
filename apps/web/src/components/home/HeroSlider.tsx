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
      cta1: { label: 'Koleksiyon Oluştur', href: '/collections/new' },
      cta2: { label: 'Pazaryerini İncele', href: '/listings' },
      accent: 'from-primary-100/40 to-amber-100/30',
    },
    {
      title: 'Premium Hot Wheels\nKoleksiyonları',
      subtitle:
        'Fast & Furious, Formula 1 ve daha fazlası. Nadir bulunan modelleri keşfedin.',
      cta1: { label: 'Hot Wheels Keşfet', href: '/listings?manufacturer=Hot Wheels' },
      cta2: { label: 'Tüm Markalar', href: '/listings' },
      accent: 'from-red-100/30 to-primary-100/30',
    },
    {
      title: 'Güvenli Takas\nSistemi',
      subtitle:
        'Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Her iki taraf için korumalı sistem.',
      cta1: { label: 'Takasa Başla', href: '/trades' },
      cta2: { label: 'Nasıl Çalışır?', href: '/help/trades' },
      accent: 'from-blue-100/30 to-indigo-100/30',
    },
  ],
  en: [
    {
      title: "Turkey's Largest\nDiecast Marketplace",
      subtitle:
        'Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.',
      cta1: { label: 'Create Collection', href: '/collections/new' },
      cta2: { label: 'Browse Marketplace', href: '/listings' },
      accent: 'from-primary-100/40 to-amber-100/30',
    },
    {
      title: 'Premium Hot Wheels\nCollections',
      subtitle:
        'Fast & Furious, Formula 1 and more. Discover rare models.',
      cta1: { label: 'Explore Hot Wheels', href: '/listings?manufacturer=Hot Wheels' },
      cta2: { label: 'All Brands', href: '/listings' },
      accent: 'from-red-100/30 to-primary-100/30',
    },
    {
      title: 'Secure Trading\nSystem',
      subtitle:
        'Trade your collections with other collectors safely. Protected system for both parties.',
      cta1: { label: 'Start Trading', href: '/trades' },
      cta2: { label: 'How It Works?', href: '/help/trades' },
      accent: 'from-blue-100/30 to-indigo-100/30',
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
    }, 6000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

  const slide = slides[currentSlide];

  return (
    <section className="relative overflow-hidden bg-surface">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20 relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Text Content */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-heading font-display leading-[1.1] tracking-tight mb-6 whitespace-pre-line">
                  {slide.title}
                </h1>
                <p className="text-base md:text-lg text-muted mb-8 max-w-lg leading-relaxed">
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

              {/* Hero image: HD diecast collection */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.25 }}
                className="relative hidden md:block aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200/60 shadow-soft bg-white"
              >
                <Image
                  src="/photos/colorful-car-toys.jpg"
                  alt={locale === 'tr' ? 'Diecast model araç koleksiyonu' : 'Diecast model car collection'}
                  fill
                  sizes="(max-width: 768px) 0px, (max-width: 1024px) 400px, 512px"
                  className="object-cover object-center"
                  priority
                  quality={90}
                />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-soft flex items-center justify-center transition-all duration-200 z-10"
        aria-label="Previous slide"
      >
        <ChevronLeftIcon className="w-5 h-5 text-heading" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-soft flex items-center justify-center transition-all duration-200 z-10"
        aria-label="Next slide"
      >
        <ChevronRightIcon className="w-5 h-5 text-heading" />
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
