'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { useAuthStore } from '@/stores/authStore';

const HERO_SLIDES = {
    tr: [
        {
            title: "Türkiye'nin En Büyük Diecast Pazaryeri",
            subtitle: 'Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.',
            cta1: { label: 'Koleksiyon oluştur', href: '/collections/new' },
            cta2: { label: 'Pazaryerini incele', href: '/listings' },
            bgColor: 'from-orange-50 to-amber-50',
        },
        {
            title: 'Premium Hot Wheels Koleksiyonları',
            subtitle: 'Fast & Furious, Formula 1 ve daha fazlası. Nadir bulunan modelleri keşfedin.',
            cta1: { label: 'Hot Wheels Keşfet', href: '/listings?manufacturer=Hot Wheels' },
            cta2: { label: 'Tüm Markalar', href: '/listings' },
            bgColor: 'from-red-50 to-orange-50',
        },
        {
            title: 'Güvenli Takas Sistemi',
            subtitle: 'Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Hem taraflar için korumalı sistem.',
            cta1: { label: 'Takasa Başla', href: '/trades' },
            cta2: { label: 'Nasıl Çalışır?', href: '/help/trades' },
            bgColor: 'from-blue-50 to-indigo-50',
        },
    ],
    en: [
        {
            title: "Turkey's Largest Diecast Marketplace",
            subtitle: 'Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.',
            cta1: { label: 'Create Collection', href: '/collections/new' },
            cta2: { label: 'Browse Marketplace', href: '/listings' },
            bgColor: 'from-orange-50 to-amber-50',
        },
        {
            title: 'Premium Hot Wheels Collections',
            subtitle: 'Fast & Furious, Formula 1 and more. Discover rare models.',
            cta1: { label: 'Explore Hot Wheels', href: '/listings?manufacturer=Hot Wheels' },
            cta2: { label: 'All Brands', href: '/listings' },
            bgColor: 'from-red-50 to-orange-50',
        },
        {
            title: 'Secure Trading System',
            subtitle: 'Trade your collections with other collectors safely. Protected system for both parties.',
            cta1: { label: 'Start Trading', href: '/trades' },
            cta2: { label: 'How It Works?', href: '/help/trades' },
            bgColor: 'from-blue-50 to-indigo-50',
        },
    ],
};

export default function HeroSlider() {
    const { locale } = useTranslation();
    const { isAuthenticated } = useAuthStore();
    const [currentSlide, setCurrentSlide] = useState(0);
    const slides = HERO_SLIDES[locale as 'tr' | 'en'];

    // Auto-rotate slides
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % slides.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [slides.length]);

    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

    return (
        <section className="relative overflow-hidden bg-white">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className={`bg-gradient-to-br ${slides[currentSlide].bgColor}`}
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            {/* Text Content */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                            >
                                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                                    {slides[currentSlide].title}
                                </h1>
                                <p className="text-lg text-gray-600 mb-8 max-w-lg">
                                    {slides[currentSlide].subtitle}
                                </p>
                                <div className="flex flex-wrap gap-4">
                                    <Link
                                        href={slides[currentSlide].cta1.href}
                                        className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30"
                                    >
                                        {slides[currentSlide].cta1.label}
                                    </Link>
                                    <Link
                                        href={slides[currentSlide].cta2.href}
                                        className="px-6 py-3 border-2 border-orange-500 text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
                                    >
                                        {slides[currentSlide].cta2.label}
                                    </Link>
                                </div>
                            </motion.div>

                            {/* Visual Area - Placeholder for future product showcase */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                                className="relative h-64 md:h-80 lg:h-96 hidden md:block"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-3xl"></div>
                                <div className="relative h-full bg-white/30 backdrop-blur-sm rounded-3xl border border-white/50 flex items-center justify-center">
                                    <div className="text-8xl animate-float">🚗</div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <button
                onClick={prevSlide}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Previous slide"
            >
                <ChevronLeftIcon className="w-5 h-5 text-gray-700" />
            </button>
            <button
                onClick={nextSlide}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Next slide"
            >
                <ChevronRightIcon className="w-5 h-5 text-gray-700" />
            </button>

            {/* Slide Indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                {slides.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setCurrentSlide(index)}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${index === currentSlide
                                ? 'bg-orange-500 w-8'
                                : 'bg-gray-400 hover:bg-gray-500'
                            }`}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))}
            </div>

            {/* Animation keyframes */}
            <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
        </section>
    );
}
